// Shared by proxy.ts (edge of the app) and the server session module.
// `__Host-` requires Secure, Path=/ and no Domain: the cookie cannot be set by
// a sibling subdomain or over plain HTTP.
export const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1'
    ? '__Host-bs_session'
    : 'bs_session';
export const RETURN_COOKIE = 'bs_return';
export const SESSION_MAX_AGE_S = 180 * 24 * 60 * 60; // absolute lifetime
