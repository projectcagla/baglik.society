import { databaseReachable } from '@/server/system/health';

// Public on purpose (uptime monitors), and silent on purpose: one word.
export async function GET() {
  const ok = await databaseReachable();
  return Response.json(
    { status: ok ? 'ok' : 'unavailable' },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function HEAD() {
  const ok = await databaseReachable();
  return new Response(null, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
