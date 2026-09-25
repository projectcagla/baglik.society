import { getViewer } from '@/server/auth/viewer';
import { exportOwnData } from '@/server/dal/profile';

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const data = await exportOwnData(viewer);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="baglik-kayitlarim.json"',
      'Cache-Control': 'private, no-store',
    },
  });
}
