import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { getViewer } from '@/server/auth/viewer';
import { getEventByNumber } from '@/server/dal/events';
import { FORMATS, Poster, loadPosterAssets, type PosterFormat } from '@/server/invitation/poster';

export const runtime = 'nodejs';

const PRIVATE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

export async function GET(req: Request, ctx: RouteContext<'/geceler/[no]/davetiye/[format]'>) {
  const viewer = await getViewer();
  const { no, format } = await ctx.params;
  if (!viewer || !(format in FORMATS))
    return new Response('Not found', { status: 404, headers: PRIVATE });
  const n = Number(no);
  const view = Number.isInteger(n) ? await getEventByNumber(viewer, n) : null;
  // exports are for invitees (and staff previewing), never for anyone else
  if (!view || (view.invite?.status !== 'davetli' && !viewer.isStaff)) {
    return new Response('Not found', { status: 404, headers: PRIVATE });
  }
  const f = format as PosterFormat;
  const { fonts, portal, wordmark } = await loadPosterAssets();
  // called as a function: satori receives plain elements, no React server runtime involved
  const png = new ImageResponse(Poster({ view, format: f, portal, wordmark }), {
    width: FORMATS[f].width,
    height: FORMATS[f].height,
    fonts,
  });
  const download = new URL(req.url).searchParams.get('indir');
  const asJpeg = new URL(req.url).searchParams.get('bicim') === 'jpg';
  const name = `baglik-gece-${view.event.number}-${f}.${asJpeg ? 'jpg' : 'png'}`;
  const headers: Record<string, string> = {
    ...PRIVATE,
    'Content-Type': asJpeg ? 'image/jpeg' : 'image/png',
    ...(download ? { 'Content-Disposition': `attachment; filename="${name}"` } : {}),
  };
  if (!asJpeg) return new Response(png.body, { headers });
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer()))
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpeg), { headers });
}
