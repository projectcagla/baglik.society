import { NextResponse, type NextRequest } from 'next/server';
import { RETURN_COOKIE, SESSION_COOKIE } from '@/lib/session-cookie';
import { safeReturnPath } from '@/lib/return-path';

// Paths an anonymous visitor may request. Everything else is private: without
// a session cookie it redirects to the door, whether or not the page exists,
// so URL guessing tells nothing. Real authorisation happens server-side (DAL
// + Postgres RLS); this is only the first, cheap filter.
const PUBLIC_EXACT = new Set(['/', '/kayip-anahtar', '/robots.txt', '/manifest.webmanifest', '/icon.svg', '/apple-icon.png']);
const PUBLIC_PREFIX = ['/_next/', '/brand/', '/fonts/', '/api/cron/'];

function isPublic(pathname: string) {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p));
}

function securityHeaders(res: NextResponse, csp: string) {
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()');
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  res.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.APP_ORIGIN?.startsWith('https://') ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  if (!isPublic(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const res = NextResponse.redirect(new URL('/', request.url), 303);
    const back = safeReturnPath(pathname + search);
    if (back && request.method === 'GET') {
      res.cookies.set(RETURN_COOKIE, back, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
        path: '/',
        maxAge: 600,
      });
    }
    return securityHeaders(res, csp);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-bs-path', pathname + search);
  requestHeaders.set('Content-Security-Policy', csp);
  return securityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|fonts/|brand/).*)'],
};
