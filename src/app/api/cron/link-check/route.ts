import { timingSafeEqual } from 'node:crypto';
import { env } from '@/server/env';
import { checkLinks } from '@/server/system/link-check';

export const maxDuration = 60;

// Called by Vercel Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const given = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret ?? ''}`;
  const ok =
    !!secret &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response('Not found', { status: 404 });
  const checked = await checkLinks({ limit: 20 });
  return Response.json({ checked }, { headers: { 'Cache-Control': 'no-store' } });
}
