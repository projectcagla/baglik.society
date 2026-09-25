import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertPublicUrl,
  guardedLookup,
  isPrivateAddress,
  nodeTransport,
  probe,
  type Resolver,
  type Transport,
} from '@/server/system/link-check';

const dns =
  (map: Record<string, string | string[]>): Resolver =>
  async (host) => {
    const v = map[host] ?? '93.184.216.34';
    return (Array.isArray(v) ? v : [v]).map((address) => ({
      address,
      family: address.includes(':') ? 6 : 4,
    }));
  };

describe('private address classification', () => {
  it('blocks private, loopback, link-local and reserved ranges in every notation', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '192.0.0.8',
      '224.0.0.1',
      '::',
      '::1',
      'fd00::1',
      'fc12:3456::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1', // mapped, hex form
      '::127.0.0.1', // IPv4-compatible
      '64:ff9b::7f00:1', // NAT64 of 127.0.0.1
      '64:ff9b::a9fe:a9fe', // NAT64 of 169.254.169.254
      '2002:7f00:1::1', // 6to4 of 127.0.0.1
      '2002:c0a8:101::', // 6to4 of 192.168.1.1
      '2001:db8::1',
      'not-an-ip',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('lets public addresses through', () => {
    for (const ip of [
      '93.184.216.34',
      '151.101.1.1',
      '2606:4700::6810:84e5',
      '64:ff9b::5db8:d822',
      '2002:5db8:d822::1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe('static URL checks', () => {
  it('refuses non-http schemes, odd ports, credentials, localhost and literal private IPs', () => {
    expect(() => assertPublicUrl('file:///etc/passwd')).toThrow('protocol');
    expect(() => assertPublicUrl('gopher://example.org/')).toThrow('protocol');
    expect(() => assertPublicUrl('https://example.org:8443/')).toThrow('port');
    expect(() => assertPublicUrl('https://u:p@example.org/')).toThrow('credentials');
    expect(() => assertPublicUrl('http://localhost/')).toThrow('private address');
    expect(() => assertPublicUrl('http://api.localhost/')).toThrow('private address');
    // the WHATWG parser normalises these to 127.0.0.1 / ::ffff:7f00:1
    for (const u of [
      'http://127.0.0.1/',
      'http://2130706433/',
      'http://0x7f.1/',
      'http://127.1/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data',
    ]) {
      expect(() => assertPublicUrl(u), u).toThrow('private address');
    }
    expect(assertPublicUrl('https://www.bfi.org.uk/features/x')).toBeInstanceOf(URL);
  });
});

describe('connection-time lookup guard (DNS rebinding)', () => {
  const run = (lookup: ReturnType<typeof guardedLookup>, all = false) =>
    new Promise<{ err: unknown; addr: unknown }>((resolve) =>
      (lookup as unknown as (h: string, o: object, cb: (e: unknown, a?: unknown) => void) => void)(
        'x.example',
        { all },
        (err, addr) => resolve({ err, addr }),
      ),
    );

  it('checks the address the socket will actually use, on every connection', async () => {
    let calls = 0;
    // first answer public, second answer private: a classic rebinding attack
    const rebinding: Resolver = async () => [
      { address: calls++ === 0 ? '93.184.216.34' : '127.0.0.1', family: 4 },
    ];
    const lookup = guardedLookup(rebinding);
    expect((await run(lookup)).err).toBeNull();
    expect(String((await run(lookup)).err)).toContain('private address');
  });

  it('rejects when any of several addresses is private', async () => {
    const { err } = await run(
      guardedLookup(dns({ 'x.example': ['93.184.216.34', '10.0.0.1'] })),
      true,
    );
    expect(String(err)).toContain('private address');
  });
});

describe('real sockets never reach a private address', () => {
  let server: http.Server;
  let port = 0;
  let hits = 0;
  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      hits += 1;
      res.end('internal');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('a hostname resolving to 127.0.0.1 is refused before connecting', async () => {
    const transport = nodeTransport(dns({ 'internal.example': '127.0.0.1' }));
    await expect(transport(new URL(`http://internal.example:${port}/`), 'HEAD')).rejects.toThrow(
      'private address',
    );
    expect(hits).toBe(0);
  });
});

describe('probe', () => {
  it('re-checks every redirect hop and never requests an internal literal', async () => {
    const calls: string[] = [];
    const transport: Transport = async (url) => {
      calls.push(url.toString());
      return url.hostname === 'public.example'
        ? { status: 302, location: 'http://10.0.0.5/admin' }
        : { status: 200, location: null };
    };
    const res = await probe('https://public.example/a', transport);
    expect(res).toMatchObject({ ok: false, status: 'hata', error: 'iç ağ adresi reddedildi' });
    expect(calls).toEqual(['https://public.example/a']);
  });

  it('follows public redirects and reports them; 403 is not a dead link', async () => {
    const transport: Transport = async (url) =>
      url.pathname === '/old' ? { status: 301, location: '/new' } : { status: 200, location: null };
    expect(await probe('https://public.example/old', transport)).toMatchObject({
      ok: true,
      status: 'yonlendirme',
      finalUrl: 'https://public.example/new',
    });
    const paywall: Transport = async () => ({ status: 403, location: null });
    expect(await probe('https://paywall.example/x', paywall)).toMatchObject({
      status: 'hata',
      httpStatus: 403,
    });
  });

  it('stops redirect loops', async () => {
    const loop: Transport = async (url) => ({
      status: 302,
      location: url.pathname === '/a' ? '/b' : '/a',
    });
    expect(await probe('https://public.example/a', loop)).toMatchObject({
      status: 'hata',
      error: 'too many redirects',
    });
  });
});
