import 'server-only';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type { LookupOptions } from 'node:dns';
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

/** IPv4 dotted quad → 4 numbers, or null. */
function v4(ip: string): number[] | null {
  if (isIP(ip) !== 4) return null;
  return ip.split('.').map(Number);
}

function privateV4([a, b]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** Expands an IPv6 address (incl. embedded dotted IPv4) into 8 hextets. */
function hextets(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]!;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    const q = v4(dotted[1]!);
    if (!q) return null;
    s =
      s.slice(0, -dotted[1]!.length) +
      `${((q[0]! << 8) | q[1]!).toString(16)}:${((q[2]! << 8) | q[3]!).toString(16)}`;
  }
  const [head, tail] = s.split('::') as [string, string | undefined];
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  const all = [...h, ...Array(Math.max(0, fill)).fill('0'), ...t];
  if (all.length !== 8) return null;
  const out = all.map((x) => parseInt(x, 16));
  return out.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : out;
}

const embedded = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];

/**
 * Private, loopback, link-local, CGNAT, benchmark, multicast and reserved
 * ranges — including IPv4 hidden inside IPv6 (mapped, compatible, NAT64,
 * 6to4), which is how filters are usually sidestepped.
 */
export function isPrivateAddress(ip: string): boolean {
  const q = v4(ip);
  if (q) return privateV4(q);
  if (isIP(ip) !== 6) return true;
  const h = hextets(ip);
  if (!h) return true;
  const zeroHead = h.slice(0, 5).every((x) => x === 0);
  if (zeroHead && h[5] === 0xffff) return privateV4(embedded(h[6]!, h[7]!)); // ::ffff:a.b.c.d
  if (zeroHead && h[5] === 0) {
    if (h[6] === 0 && (h[7] === 0 || h[7] === 1)) return true; // :: and ::1
    return privateV4(embedded(h[6]!, h[7]!)); // ::a.b.c.d (deprecated compatible)
  }
  if (h[0] === 0x64 && h[1] === 0xff9b) return privateV4(embedded(h[6]!, h[7]!)); // NAT64
  if (h[0] === 0x2002) return privateV4(embedded(h[1]!, h[2]!)); // 6to4
  if (h[0] === 0x2001 && h[1] === 0xdb8) return true; // documentation
  if (h[0] === 0x100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true; // discard
  const top = h[0]! >> 8;
  if (top === 0xff) return true; // multicast
  if ((h[0]! & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((h[0]! & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  return false;
}

export type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
const systemResolve: Resolver = (host) => lookup(host, { all: true, verbatim: true });

/**
 * DNS lookup used *by the socket itself*: the address that is checked is the
 * address that is connected to, so DNS rebinding between a check and the
 * request is not possible.
 */
export function guardedLookup(resolve: Resolver = systemResolve): LookupFunction {
  return ((hostname: string, options: LookupOptions, callback: (...args: unknown[]) => void) => {
    resolve(hostname).then(
      (addrs) => {
        if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
          callback(Object.assign(new Error('private address'), { code: 'EPRIVATE' }));
        } else if (options?.all) {
          callback(null, addrs);
        } else {
          callback(null, addrs[0]!.address, addrs[0]!.family);
        }
      },
      (err: unknown) => callback(err),
    );
  }) as unknown as LookupFunction;
}

/**
 * Static checks that need no DNS: http(s) only, default ports, no embedded
 * credentials, and literal IPs (in any notation the URL parser accepts,
 * e.g. 2130706433, 0x7f.1, [::ffff:7f00:1]) must be public.
 */
export function assertPublicUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
  if (u.username || u.password) throw new Error('credentials');
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('port');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isPrivateAddress(host)) throw new Error('private address');
  if (!host || host === 'localhost' || host.endsWith('.localhost'))
    throw new Error('private address');
  return u;
}

export type Transport = (
  url: URL,
  method: 'HEAD' | 'GET',
) => Promise<{ status: number; location: string | null }>;

/** One request, no redirects followed, connection-time IP guard, 8 s budget. */
export function nodeTransport(resolve: Resolver = systemResolve): Transport {
  return (url, method) =>
    new Promise((resolveRes, reject) => {
      const mod = url.protocol === 'https:' ? https : http;
      const req = mod.request(
        url,
        {
          method,
          agent: false,
          lookup: guardedLookup(resolve),
          timeout: 8000,
          headers: {
            'User-Agent': UA,
            Accept: 'text/html,*/*;q=0.5',
            ...(method === 'GET' ? { Range: 'bytes=0-2047' } : {}),
          },
        },
        (res) => {
          res.resume();
          resolveRes({ status: res.statusCode ?? 0, location: res.headers.location ?? null });
          req.destroy();
        },
      );
      req.on('timeout', () =>
        req.destroy(Object.assign(new Error('zaman aşımı'), { name: 'TimeoutError' })),
      );
      req.on('error', reject);
      req.end();
    });
}

export async function probe(
  url: string,
  transport: Transport = nodeTransport(),
): Promise<LinkResult> {
  const started = Date.now();
  // redirects are followed by hand (max 5) so every hop passes both guards
  const follow = async (method: 'HEAD' | 'GET') => {
    let current = url;
    for (let i = 0; i <= 5; i++) {
      const res = await transport(assertPublicUrl(current), method);
      if (res.status >= 300 && res.status < 400 && res.location) {
        current = new URL(res.location, current).toString();
        continue;
      }
      return { status: res.status, finalUrl: current };
    }
    throw new Error('too many redirects');
  };
  try {
    let res = await follow('HEAD');
    if ([403, 405, 501].includes(res.status)) res = await follow('GET');
    const status = classify(res.status, url, res.finalUrl, null);
    return {
      ok: status === 'saglam' || status === 'yonlendirme',
      status,
      httpStatus: res.status,
      finalUrl: res.finalUrl,
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
