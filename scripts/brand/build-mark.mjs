// Writes public/brand/mark.svg, src/app/icon.svg and docs/brand/mark-comparison.png
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { FIGURE, GLYPH, MARK_VIEWBOX } from './mark-path.mjs';

const gradient = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F2EEF3"/>
      <stop offset="0.55" stop-color="#D2C4E0"/>
      <stop offset="1" stop-color="#7A57A0"/>
    </linearGradient>`;

const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" role="img" aria-label="bağlık.society">
  <!-- Simplified single-colour derivative of the approved master, traced in
       master pixel coordinates. Texture, grain and light spill are omitted on
       purpose. Differences: docs/brand/ASSET_MANIFEST.md -->
  <defs>
    ${gradient('bs-mark-fill')}
  </defs>
  <path fill="url(#bs-mark-fill)" fill-rule="evenodd" d="${GLYPH} ${FIGURE}"/>
</svg>
`;
writeFileSync('public/brand/mark.svg', mark);

// Favicon: figure dropped (it is < 2 px at 32 px), dark ground for light tabs.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0A0A0C"/>
  <defs>
    ${gradient('g')}
  </defs>
  <g transform="translate(32 32) scale(0.158) translate(-276 -360)">
    <path fill="url(#g)" fill-rule="evenodd" d="${GLYPH}"/>
  </g>
</svg>
`;
writeFileSync('src/app/icon.svg', icon);

// Comparison sheet for review: master | derivative | outline over master | icons
const H = 480;
const crop = { left: 186, top: 192, width: 180, height: 336 };
const master = await sharp('brand/source/01_APPROVED_identity_master_reference.jpg').extract(crop).resize({ height: H }).png().toBuffer();
const deriv = await sharp(Buffer.from(mark), { density: 400 }).resize({ height: H }).png().toBuffer();
const outline = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" width="${Math.round((180 / 336) * H)}" height="${H}">
  <path fill="none" stroke="#7CF2C2" stroke-width="1.4" fill-rule="evenodd" d="${GLYPH} ${FIGURE}"/></svg>`);
const over = await sharp(master).composite([{ input: await sharp(outline).png().toBuffer() }]).png().toBuffer();
const icons = [];
let x = 860;
for (const s of [16, 32, 48, 96]) {
  icons.push({ input: await sharp(Buffer.from(icon), { density: 300 }).resize(s).png().toBuffer(), left: x, top: 420 - s });
  x += s + 24;
}
const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="560"><style>text{font:15px monospace;fill:#B5ACBB}</style>
<text x="40" y="540">master (raster, onaylı)</text><text x="330" y="540">mark.svg (türev)</text>
<text x="600" y="540">türev kontur / master</text><text x="860" y="540">icon.svg 16/32/48/96</text></svg>`);
await sharp({ create: { width: 1200, height: 560, channels: 3, background: '#0A0A0C' } })
  .composite([
    { input: master, left: 40, top: 30 },
    { input: deriv, left: 330, top: 30 },
    { input: over, left: 600, top: 30 },
    ...icons,
    { input: labels, left: 0, top: 0 },
  ])
  .png()
  .toFile('docs/brand/mark-comparison.png');
console.log('mark written');
