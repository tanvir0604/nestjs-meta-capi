import { buildCustomData } from '../src/builders/custom-data.builder';
import { buildNormalizedEvent, resolveEventTime } from '../src/builders/event.builder';
import { buildUserData } from '../src/builders/user-data.builder';
import { MetaCapiValidationError } from '../src/errors/meta-capi.error';

describe('buildUserData (ADR-3: raw pass-through, no hashing)', () => {
  it('maps camelCase to the SDK snake_case fields', () => {
    expect(
      buildUserData({
        firstName: 'Joe',
        lastName: 'Smith',
        clientIpAddress: '1.2.3.4',
        fbLoginId: 'x',
      }),
    ).toEqual({
      first_name: 'Joe',
      last_name: 'Smith',
      client_ip_address: '1.2.3.4',
      fb_login_id: 'x',
    });
  });

  it('never hashes or otherwise transforms values', () => {
    expect(buildUserData({ email: 'Joe@Example.com ' }).email).toBe('Joe@Example.com ');
  });

  it('drops empty and non-string values', () => {
    expect(buildUserData({ email: '' })).toEqual({});
    expect(buildUserData({ externalId: 123 as unknown as string })).toEqual({});
  });
});

describe('buildCustomData (camelCase → snake_case)', () => {
  it('maps the documented fields', () => {
    expect(
      buildCustomData({
        contentName: 'Newsletter Signup',
        currency: 'USD',
        value: 500,
        numItems: 2,
      }),
    ).toEqual({
      content_name: 'Newsletter Signup',
      currency: 'USD',
      value: 500,
      num_items: 2,
    });
  });

  it('converts nested contents entries', () => {
    expect(buildCustomData({ contents: [{ itemPrice: 10, deliveryCategory: 'home' }] })).toEqual({
      contents: [{ item_price: 10, delivery_category: 'home' }],
    });
  });

  it('preserves unknown keys for custom_properties delivery', () => {
    expect(buildCustomData({ myCustomField: 'kept' })).toEqual({ my_custom_field: 'kept' });
  });

  it('skips null and undefined values', () => {
    expect(buildCustomData({ value: null as unknown as number, currency: 'USD' })).toEqual({
      currency: 'USD',
    });
  });

  it('skips undefined keys inside nested values', () => {
    expect(
      buildCustomData({
        contents: [{ title: 'x', description: undefined as unknown as string }],
      }),
    ).toEqual({
      contents: [{ title: 'x' }],
    });
  });
});

describe('resolveEventTime (ADR-2)', () => {
  it('defaults to the current Unix time in seconds', () => {
    const before = Math.floor(Date.now() / 1000);
    const value = resolveEventTime();
    const after = Math.floor(Date.now() / 1000);

    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });

  it('converts a Date to Unix seconds', () => {
    expect(resolveEventTime(new Date('2024-01-01T00:00:00.000Z'))).toBe(1704067200);
  });

  it('passes an explicit seconds value through', () => {
    expect(resolveEventTime(1_700_000_000)).toBe(1_700_000_000);
  });

  it('detects and converts a millisecond value', () => {
    expect(resolveEventTime(1_700_000_000_000)).toBe(1_700_000_000);
  });

  it('rejects a non-finite value', () => {
    expect(() => resolveEventTime(Number.NaN)).toThrow(MetaCapiValidationError);
  });
});

describe('buildNormalizedEvent', () => {
  it('applies the action_source and event_time defaults the SDK will not (ADR-2)', () => {
    const event = buildNormalizedEvent({ eventName: 'Lead' });

    expect(event.actionSource).toBe('website');
    expect(event.eventTime).toBeGreaterThan(1_600_000_000);
  });

  it('stringifies the event id and keeps it stable', () => {
    expect(buildNormalizedEvent({ eventName: 'Lead', eventId: 42 }).eventId).toBe('42');
  });

  it('requires an event name', () => {
    expect(() => buildNormalizedEvent({ eventName: '   ' })).toThrow(MetaCapiValidationError);
  });

  it('fills fbc/fbp/ip/user-agent from the request context', () => {
    const event = buildNormalizedEvent({
      eventName: 'Lead',
      requestContext: {
        fbc: 'fb.1.1.abc',
        fbp: 'fb.1.1.def',
        clientIpAddress: '9.9.9.9',
        clientUserAgent: 'jest-agent',
        eventSourceUrl: 'https://example.com/lead',
        cookiesToSet: [],
      },
    });

    expect(event.userData).toEqual({
      fbc: 'fb.1.1.abc',
      fbp: 'fb.1.1.def',
      client_ip_address: '9.9.9.9',
      client_user_agent: 'jest-agent',
    });
    expect(event.eventSourceUrl).toBe('https://example.com/lead');
  });

  it('lets explicit user data win over the request context', () => {
    const event = buildNormalizedEvent({
      eventName: 'Lead',
      userData: { fbc: 'explicit' },
      requestContext: { fbc: 'derived', cookiesToSet: [] },
    });

    expect(event.userData.fbc).toBe('explicit');
  });
});
