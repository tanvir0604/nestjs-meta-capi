import type { CookieSettings } from 'capi-param-builder-nodejs';

/**
 * A minimal structural view of the framework response objects we support.
 * Express's `res` exposes `append`/`header`/`setHeader`; Fastify's `reply`
 * exposes `header`. `append` is preferred where present because it is the only
 * one with correct multi-value `Set-Cookie` semantics.
 */
export interface MetaResponseLike {
  append?(name: string, value: string): unknown;
  header?(name: string, value: string | string[]): unknown;
  setHeader?(name: string, value: string | string[]): unknown;
}

/** Serialize a Parameter Builder `CookieSettings` into a `Set-Cookie` value. */
export function serializeCookie(cookie: CookieSettings): string {
  const parts = [`${cookie.name}=${cookie.value}`];

  const maxAge = Number(cookie.maxAge);
  if (Number.isFinite(maxAge) && maxAge > 0) {
    parts.push(`Max-Age=${Math.floor(maxAge)}`);
  }

  // A path is required for the cookie to be sent on subsequent requests.
  parts.push('Path=/');

  if (typeof cookie.domain === 'string' && cookie.domain.length > 0) {
    parts.push(`Domain=${cookie.domain}`);
  }

  return parts.join('; ');
}

/**
 * Write the Parameter Builder's `cookiesToSet` back as first-party cookies
 * (ADR-8). Best-effort: returns the number of cookies written and never throws
 * — a response that has already been flushed simply results in `0`.
 */
export function writeSetCookies(
  response: MetaResponseLike | undefined,
  cookies: CookieSettings[],
): number {
  if (response === undefined || cookies.length === 0) {
    return 0;
  }

  const values = cookies.map(serializeCookie);

  if (typeof response.append === 'function') {
    for (const value of values) {
      response.append('Set-Cookie', value);
    }
    return values.length;
  }

  if (typeof response.header === 'function') {
    response.header('Set-Cookie', values);
    return values.length;
  }

  if (typeof response.setHeader === 'function') {
    response.setHeader('Set-Cookie', values);
    return values.length;
  }

  return 0;
}
