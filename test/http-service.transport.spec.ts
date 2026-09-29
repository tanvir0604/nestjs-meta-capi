import { EventResponse } from 'facebook-nodejs-business-sdk';

import {
  HttpServiceTransport,
  isDeliverySuccessful,
  type MetaHttpRequest,
  type MetaHttpResponse,
} from '../src/clients/http-service.transport';
import { MetaCapiDeliveryError } from '../src/errors/meta-capi.error';

const successBody = {
  events_received: 1,
  messages: [],
  fbtrace_id: 'trace-1',
  id: 'ds-1',
  num_processed_entries: 1,
};

describe('HttpServiceTransport', () => {
  it('forwards the request untouched and resolves an EventResponse', async () => {
    const seen: MetaHttpRequest[] = [];
    const transport = new HttpServiceTransport(async (request) => {
      seen.push(request);
      return { status: 200, body: successBody } satisfies MetaHttpResponse;
    });

    const result = await transport.executeRequest(
      'https://graph.facebook.com/v24.0/pixel-a/events',
      'POST',
      { 'Content-Type': 'application/json' },
      { access_token: 'token-a', data: [] },
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe('https://graph.facebook.com/v24.0/pixel-a/events');
    expect(seen[0]?.params.access_token).toBe('token-a');
    expect(result).toBeInstanceOf(EventResponse);
    expect(result.events_received).toBe(1);
    expect(result.fbtrace_id).toBe('trace-1');
    expect(result.num_processed_entries).toBe(1);
  });

  it('throws MetaCapiDeliveryError on a non-2xx response', async () => {
    const transport = new HttpServiceTransport(async () => ({
      status: 500,
      body: { error: { message: 'internal' }, fbtrace_id: 'trace-err' },
    }));

    await expect(
      transport.executeRequest(
        'https://graph.facebook.com/v24.0/pixel-a/events',
        'POST',
        {},
        {
          access_token: 'token-a',
        },
      ),
    ).rejects.toBeInstanceOf(MetaCapiDeliveryError);
  });

  it('never leaks the access token through an error message', async () => {
    const transport = new HttpServiceTransport(async () => ({ status: 503, body: {} }));

    let caught: unknown;
    try {
      await transport.executeRequest(
        'https://graph.facebook.com/v24.0/pixel-a/events',
        'POST',
        {},
        {
          access_token: 'super-secret-token',
        },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MetaCapiDeliveryError);
    expect((caught as Error).message).not.toContain('super-secret-token');
    expect(JSON.stringify((caught as MetaCapiDeliveryError).context)).not.toContain(
      'super-secret-token',
    );
  });
});

describe('isDeliverySuccessful (ADR-5: body-aware success)', () => {
  it('accepts a response with events received and no messages', () => {
    expect(isDeliverySuccessful({ eventsReceived: 1, messages: [] })).toBe(true);
  });

  it('rejects a 200 whose events_received is zero', () => {
    expect(isDeliverySuccessful({ eventsReceived: 0, messages: [] })).toBe(false);
  });

  it('rejects a 200 that carries per-event error messages', () => {
    expect(isDeliverySuccessful({ eventsReceived: 1, messages: ['Invalid parameter'] })).toBe(
      false,
    );
  });
});
