import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isPrivateAddress, probe } from '@/server/system/link-check';

type Resolve = (host: string, opts: { all: true }) => Promise<{ address: string }[]>;
const dns =
  (map: Record<string, string>): Resolve =>
  async (host) => [{ address: map[host] ?? '93.184.216.34' }];

describe('link checker SSRF guard', () => {
  it('classifies private and public addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['93.184.216.34', '151.101.1.1', '2606:4700::6810:84e5'])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('refuses internal targets, odd ports, credentials and non-http schemes', async () => {
    const resolve = dns({ 'metadata.internal': '169.254.169.254' });
    await expect(
      assertPublicUrl('http://169.254.169.254/latest/meta-data', resolve),
    ).rejects.toThrow();
    await expect(assertPublicUrl('https://metadata.internal/', resolve)).rejects.toThrow(
      'private address',
    );
    await expect(assertPublicUrl('http://[::1]/', resolve)).rejects.toThrow();
    await expect(assertPublicUrl('https://example.org:8443/', resolve)).rejects.toThrow('port');
    await expect(assertPublicUrl('https://u:p@example.org/', resolve)).rejects.toThrow(
      'credentials',
    );
    await expect(assertPublicUrl('file:///etc/passwd', resolve)).rejects.toThrow('protocol');
    await expect(
      assertPublicUrl('https://www.bfi.org.uk/features/x', resolve),
    ).resolves.toBeInstanceOf(URL);
  });

  it('re-checks every redirect hop and never fetches an internal one', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (target: string) => {
      calls.push(target);
      if (target.startsWith('https://public.example')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://internal.example/admin' },
        });
      }
      return new Response('secret', { status: 200 });
    }) as unknown as typeof fetch;
    const res = await probe(
      'https://public.example/a',
      fetchImpl,
      dns({ 'internal.example': '10.0.0.5' }),
    );
    expect(res).toMatchObject({ ok: false, status: 'hata', error: 'iç ağ adresi reddedildi' });
    expect(calls).toEqual(['https://public.example/a']);
  });

  it('follows public redirects and reports them', async () => {
    const fetchImpl = (async (target: string) =>
      target.endsWith('/old')
        ? new Response(null, { status: 301, headers: { location: '/new' } })
        : new Response(null, { status: 200 })) as unknown as typeof fetch;
    const res = await probe('https://public.example/old', fetchImpl, dns({}));
    expect(res).toMatchObject({
      ok: true,
      status: 'yonlendirme',
      finalUrl: 'https://public.example/new',
    });
  });
});
