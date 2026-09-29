import type { CookieSettings } from 'capi-param-builder-nodejs';

import { serializeCookie, writeSetCookies } from '../src/http/cookie-writer';

const cookie = (overrides: Partial<CookieSettings> = {}): CookieSettings => ({
  name: '_fbp',
  value: 'fb.1.1700000000000.1234567890',
  maxAge: 7_776_000,
  domain: 'example.com',
  ...overrides,
});

describe('serializeCookie (ADR-8)', () => {
  it('serializes the name, value, max-age, path and domain', () => {
    expect(serializeCookie(cookie())).toBe(
      '_fbp=fb.1.1700000000000.1234567890; Max-Age=7776000; Path=/; Domain=example.com',
    );
  });

  it('omits Max-Age and Domain when they are not provided', () => {
    const settings: CookieSettings = {
      name: '_fbc',
      value: 'fb.1.1.abc',
      maxAge: 0,
      domain: '',
    };

    expect(serializeCookie(settings)).toBe('_fbc=fb.1.1.abc; Path=/');
  });
});

describe('writeSetCookies', () => {
  it('prefers append when available (correct multi-value semantics)', () => {
    const headers: Array<[string, string]> = [];
    const response = { append: (name: string, value: string) => headers.push([name, value]) };

    expect(writeSetCookies(response, [cookie()])).toBe(1);
    expect(headers).toEqual([
      [
        'Set-Cookie',
        '_fbp=fb.1.1700000000000.1234567890; Max-Age=7776000; Path=/; Domain=example.com',
      ],
    ]);
  });

  it('falls back to header (Fastify-style reply)', () => {
    const calls: Array<[string, string | string[]]> = [];
    const response = {
      header: (name: string, value: string | string[]) => calls.push([name, value]),
    };

    expect(writeSetCookies(response, [cookie(), cookie({ name: '_fbc' })])).toBe(2);
    expect(calls[0]?.[0]).toBe('Set-Cookie');
    expect(calls[0]?.[1]).toHaveLength(2);
  });

  it('falls back to setHeader', () => {
    let received: string | string[] | undefined;
    const response = {
      setHeader: (_name: string, value: string | string[]) => {
        received = value;
      },
    };

    expect(writeSetCookies(response, [cookie()])).toBe(1);
    expect(received).toEqual([
      '_fbp=fb.1.1700000000000.1234567890; Max-Age=7776000; Path=/; Domain=example.com',
    ]);
  });

  it('writes nothing for an empty list or an unusable response', () => {
    const response = { append: () => undefined };

    expect(writeSetCookies(response, [])).toBe(0);
    expect(writeSetCookies(undefined, [cookie()])).toBe(0);
    expect(writeSetCookies({}, [cookie()])).toBe(0);
  });
});
