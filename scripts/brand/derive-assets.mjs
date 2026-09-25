// Derives web assets from the approved brand master.
//
// Input : brand/source/01_APPROVED_identity_master_reference.jpg (committed)
//         brand/private-reference/03_film_night_002_invitation_reference.webp (optional, gitignored)
// Output: public/brand/*  (served to everyone — the door shows the mark)
//         src/assets/brand/* (read server-side by the invitation export)
//
// Nothing here redraws the logo. Raster layers are pixel crops of the master;
// "alpha from luminance" only removes the black ground so the crop sits on
// #0A0A0C without a visible rectangle. See docs/brand/ASSET_MANIFEST.md.

import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const MASTER = 'brand/source/01_APPROVED_identity_master_reference.jpg';
const INVITATION = 'brand/private-reference/03_film_night_002_invitation_reference.webp';

mkdirSync('public/brand', { recursive: true });
mkdirSync('src/assets/brand', { recursive: true });

/**
 * Converts a light-on-black crop to premultiplied-free RGBA:
 * alpha = max(r,g,b); colour = c / alpha. Composited on any near-black
 * background this reproduces the original pixels (c + (1-a)·bg ≈ c).
 * An optional edge feather hides grain at the crop borders.
 */
async function lumaToAlpha(input, region, { feather = 0, floor = 0 } = {}) {
  const { data, info } = await sharp(input)
    .extract(region)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const o = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let a = Math.max(r, g, b);
      // drop the master's near-black ground noise
      a = a <= floor ? 0 : Math.round(((a - floor) / (255 - floor)) * 255);
      if (feather > 0) {
        // fade only the outer band of each edge (smoothstep)
        const d = Math.min(x / W, (W - 1 - x) / W, y / H, (H - 1 - y) / H);
        const t = Math.min(1, Math.max(0, d / feather));
        a = Math.round(a * t * t * (3 - 2 * t));
      }
      const k = a > 0 ? 255 / Math.max(r, g, b, 1) : 0;
      out[o] = Math.min(255, Math.round(r * k));
      out[o + 1] = Math.min(255, Math.round(g * k));
      out[o + 2] = Math.min(255, Math.round(b * k));
      out[o + 3] = a;
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } });
}

// ── master crops ───────────────────────────────────────────────────────────
// Measured on the 588×751 master: glyph 198–398 × 200–528, glow to ~154–471,
// wordmark 58–525 × 545–651. Crops keep the master's own spacing.
const portal = await lumaToAlpha(MASTER, { left: 110, top: 160, width: 396, height: 396 }, { feather: 0.1, floor: 6 });
await portal.clone().png({ compressionLevel: 9 }).toFile('public/brand/portal.png');
await portal.clone().webp({ quality: 92, alphaQuality: 100 }).toFile('public/brand/portal.webp');

const wordmark = await lumaToAlpha(MASTER, { left: 50, top: 548, width: 484, height: 112 }, { floor: 10 });
await wordmark.clone().png({ compressionLevel: 9 }).toFile('public/brand/wordmark.png');
await wordmark.clone().webp({ quality: 95, alphaQuality: 100 }).toFile('public/brand/wordmark.webp');

// Master lockup (portal above wordmark, spacing as in master) for previews.
const lockup = await lumaToAlpha(MASTER, { left: 40, top: 168, width: 508, height: 496 }, { floor: 8 });
await lockup.clone().webp({ quality: 92, alphaQuality: 100 }).toFile('public/brand/lockup.webp');

// Icons: the textured glyph cropped square from the master. At ≤48 px the
// silhouette becomes a smudge, so small sizes use public/brand/mark.svg.
const iconSrc = sharp(MASTER).extract({ left: 150, top: 190, width: 300, height: 350 });
const iconSquare = async (size, pad) => {
  const inner = Math.round(size * (1 - pad * 2));
  const glyph = await iconSrc.clone().resize({ height: inner, fit: 'inside' }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: '#0A0A0C' } })
    .composite([{ input: glyph, gravity: 'center' }])
    .png({ compressionLevel: 9 });
};
await (await iconSquare(180, 0.08)).toFile('src/app/apple-icon.png');
await (await iconSquare(192, 0.1)).toFile('public/brand/icon-192.png');
await (await iconSquare(512, 0.1)).toFile('public/brand/icon-512.png');
// maskable: safe zone is the inner 80 % circle
await (await iconSquare(512, 0.2)).toFile('public/brand/icon-maskable-512.png');

// ── invitation portal (higher resolution layer for 1080×1920 exports) ─────
if (existsSync(INVITATION)) {
  const inv = await lumaToAlpha(INVITATION, { left: 130, top: 0, width: 680, height: 960 }, { feather: 0.06, floor: 10 });
  await inv.clone().png({ compressionLevel: 9 }).toFile('src/assets/brand/portal-hd.png');
  console.log('invitation portal layer written');
} else {
  console.log('invitation reference not present — keeping committed src/assets/brand/portal-hd.png');
}

console.log('brand assets derived');
