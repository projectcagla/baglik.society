import 'server-only';
import { asSystem } from '@/server/db/system';

// Source link health. Never deletes or rewrites a link — it only records what
// the source answered so the editor can decide. Polite by design: sequential,
// one request at a time, a pause between requests to the same host, short
// timeouts, a small batch per run, and an honest User-Agent.

export type LinkStatus = 'saglam' | 'yonlendirme' | 'kirik' | 'hata';

export interface LinkResult {
  ok: boolean;
  status: LinkStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  error: string | null;
  durationMs: number;
}

const UA = 'baglik-society-linkcheck/1.0 (+private film club; checks saved source links weekly)';

export function classify(
  httpStatus: number | null,
  requested: string,
  finalUrl: string | null,
  error: string | null,
): LinkStatus {
  if (error || httpStatus === null) return 'hata';
  if (httpStatus === 404 || httpStatus === 410) return 'kirik';
  if (httpStatus >= 200 && httpStatus < 400) {
    const norm = (u: string) => u.replace(/\/$/, '').replace(/^http:/, 'https:');
    return finalUrl && norm(finalUrl) !== norm(requested) ? 'yonlendirme' : 'saglam';
  }
  // 401/403/429/5xx: paywalls, bot walls and outages are not proof of a dead link
  return 'hata';
}

export async function probe(url: string, fetchImpl: typeof fetch = fetch): Promise<LinkResult> {
  const started = Date.now();
  const attempt = async (method: 'HEAD' | 'GET') =>
    fetchImpl(url, {
      method,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,*/*;q=0.5',
        ...(method === 'GET' ? { Range: 'bytes=0-2047' } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
  try {
    let res = await attempt('HEAD');
    if ([403, 405, 501].includes(res.status)) res = await attempt('GET');
    await res.body?.cancel().catch(() => {});
    const status = classify(res.status, url, res.url || null, null);
    return {
      ok: status === 'saglam' || status === 'yonlendirme',
      status,
      httpStatus: res.status,
      finalUrl: res.url || null,
      error: null,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : 'error';
    return {
      ok: false,
      status: 'hata',
      httpStatus: null,
      finalUrl: null,
      error: name === 'TimeoutError' ? 'zaman aşımı' : name,
      durationMs: Date.now() - started,
    };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function checkLinks(
  opts: { ids?: string[]; limit?: number; staleHours?: number } = {},
): Promise<number> {
  const limit = Math.min(opts.limit ?? 20, 50);
  const stale = opts.staleHours ?? 24 * 6;
  const rows = await asSystem((tx) =>
    opts.ids?.length
      ? tx<
          { id: string; url: string }[]
        >`select id, url from resources where id = any(${opts.ids}) and url is not null limit ${limit}`
      : tx<{ id: string; url: string }[]>`
          select id, url from resources
           where url is not null and (link_checked_at is null or link_checked_at < now() - make_interval(hours => ${stale}))
           order by link_checked_at nulls first limit ${limit}`,
  );
  const lastHit = new Map<string, number>();
  for (const r of rows) {
    const host = new URL(r.url).host;
    const wait = (lastHit.get(host) ?? 0) + 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    const res = await probe(r.url);
    lastHit.set(host, Date.now());
    await asSystem(async (tx) => {
      await tx`insert into link_checks (resource_id, ok, http_status, final_url, error, duration_ms)
               values (${r.id}, ${res.ok}, ${res.httpStatus}, ${res.finalUrl}, ${res.error}, ${res.durationMs})`;
      await tx`update resources set link_status = ${res.status}, link_checked_at = now(), link_http_status = ${res.httpStatus},
                 link_final_url = ${res.finalUrl}, link_error = ${res.error} where id = ${r.id}`;
      await tx`delete from link_checks where resource_id = ${r.id} and id not in (
                 select id from link_checks where resource_id = ${r.id} order by checked_at desc limit 20)`;
    });
  }
  return rows.length;
}
