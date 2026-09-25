import 'server-only';
import { asSystem } from '@/server/db/system';

/**
 * A liveness signal for uptime monitors: can the app reach its database
 * within a few seconds? Returns a bare boolean — no version, host, error text
 * or counts leave the server.
 */
export async function databaseReachable(timeoutMs = 3000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      asSystem((tx) => tx`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
