import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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

/** Private, loopback, link-local, CGNAT, benchmark, multicast and reserved ranges. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    if (x.startsWith('::ffff:')) return isPrivateAddress(x.slice(7));
    return /^(fc|fd|fe[89ab]|ff)/.test(x);
  }
  return true;
}

type Resolver = (host: string, opts: { all: true }) => Promise<{ address: string }[]>;
const systemResolve: Resolver = (host, opts) => lookup(host, opts);

/**
 * Editors type these URLs, so the server must not be steered into its own
 * network (SSRF): http(s) only, default ports, no credentials, and every hop
 * resolved and checked against private ranges.
 */
export async function assertPublicUrl(
  raw: string,
  resolve: Resolver = systemResolve,
): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
  if (u.username || u.password) throw new Error('credentials');
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('port');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await resolve(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error('private address');
  }
  return u;
}

export async function probe(
  url: string,
  fetchImpl: typeof fetch = fetch,
  resolve: Resolver = systemResolve,
): Promise<LinkResult> {
  const started = Date.now();
  const hop = async (target: string, method: 'HEAD' | 'GET') => {
    await assertPublicUrl(target, resolve);
    return fetchImpl(target, {
      method,
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,*/*;q=0.5',
        ...(method === 'GET' ? { Range: 'bytes=0-2047' } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
  };
  // redirects are followed by hand (max 5) so each hop passes the guard
  const follow = async (method: 'HEAD' | 'GET') => {
    let current = url;
    for (let i = 0; i <= 5; i++) {
      const res = await hop(current, method);
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        await res.body?.cancel().catch(() => {});
        current = new URL(loc, current).toString();
        continue;
      }
      return { res, finalUrl: current };
    }
    throw new Error('too many redirects');
  };
  try {
    let { res, finalUrl } = await follow('HEAD');
    if ([403, 405, 501].includes(res.status)) ({ res, finalUrl } = await follow('GET'));
    await res.body?.cancel().catch(() => {});
    const status = classify(res.status, url, finalUrl, null);
    return {
      ok: status === 'saglam' || status === 'yonlendirme',
      status,
      httpStatus: res.status,
      finalUrl,
      error: null,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const e = err instanceof Error ? err : new Error('error');
    const error =
      e.name === 'TimeoutError'
        ? 'zaman aşımı'
        : e.message === 'private address'
          ? 'iç ağ adresi reddedildi'
          : e.message || e.name;
    return {
      ok: false,
      status: 'hata',
      httpStatus: null,
      finalUrl: null,
      error,
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
