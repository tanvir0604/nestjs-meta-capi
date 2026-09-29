import { ParamBuilder } from 'capi-param-builder-nodejs';

import { extractRequestContext } from '../src/clients/request-context';
import type { MetaRequestLike } from '../src/types/meta-request';

const factory = (): ParamBuilder => new ParamBuilder();

const expressLike: MetaRequestLike = {
  headers: {
    host: 'example.com',
    'user-agent': 'jest-agent/1.0',
    'x-forwarded-for': '203.0.113.7',
    cookie: '_fbp=fb.1.1700000000000.1234567890; _fbc=fb.1.1700000000000.IwAR123',
  },
  protocol: 'https',
  originalUrl: '/lead',
  socket: { remoteAddress: '10.0.0.1' },
};

describe('extractRequestContext (SPEC.md §6)', () => {
  it('degrades to empty when there is no request', () => {
    const context = extractRequestContext(undefined, factory);

    expect(context.cookiesToSet).toEqual([]);
    expect(context.clientUserAgent).toBeUndefined();
    expect(context.eventSourceUrl).toBeUndefined();
  });

  it('reads client_user_agent from the request headers (never auto-filled)', () => {
    const context = extractRequestContext(expressLike, factory);

    expect(context.clientUserAgent).toBe('jest-agent/1.0');
  });

  it('extracts fbc, fbp and the client IP', () => {
    const context = extractRequestContext(expressLike, factory);

    expect(context.fbp).toMatch(/^fb\.1\./);
    expect(context.fbc).toMatch(/^fb\.1\./);
    // The Parameter Builder appends its own token to the client IP.
    expect(context.clientIpAddress).toMatch(/^203\.0\.113\.7/);
    expect(Array.isArray(context.cookiesToSet)).toBe(true);
  });

  it('builds the event source URL from scheme, host and path', () => {
    const context = extractRequestContext(expressLike, factory);

    expect(context.eventSourceUrl).toMatch(/^https:\/\/example\.com\/lead/);
  });

  it('never throws when the parameter builder fails', () => {
    const context = extractRequestContext(expressLike, () => {
      throw new Error('builder exploded');
    });

    expect(context.cookiesToSet).toEqual([]);
    expect(context.clientUserAgent).toBe('jest-agent/1.0');
  });

  it('reads user-agent from an array header or a request getter', () => {
    expect(
      extractRequestContext({ headers: { 'user-agent': ['arr-agent'] } }, factory).clientUserAgent,
    ).toBe('arr-agent');

    expect(
      extractRequestContext(
        { get: (name) => (name === 'user-agent' ? 'getter-agent' : undefined) },
        factory,
      ).clientUserAgent,
    ).toBe('getter-agent');
  });

  it('omits user-agent when the request has none', () => {
    expect(extractRequestContext({ headers: {} }, factory).clientUserAgent).toBeUndefined();
    expect(extractRequestContext({}, factory).clientUserAgent).toBeUndefined();
  });
});
