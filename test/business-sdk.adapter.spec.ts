import { createHash } from 'node:crypto';

import { EventResponse, type HttpServiceInterface } from 'facebook-nodejs-business-sdk';

import { BusinessSdkAdapter } from '../src/clients/business-sdk.adapter';
import type { MetaNormalizedEvent } from '../src/clients/meta-sdk.adapter';
import type { ResolvedDataset } from '../src/config/meta-capi.options';
import { RecordingLogger } from './helpers';

interface CapturedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  params: Record<string, unknown>;
}

class CapturingHttpService implements HttpServiceInterface {
  readonly calls: CapturedCall[] = [];

  constructor(private readonly response: EventResponse = new EventResponse(1, [], 't', 'i', 1)) {}

  async executeRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    params: Record<string, unknown>,
  ): Promise<EventResponse> {
    this.calls.push({ url, method, headers, params });
    return this.response;
  }
}

const DATASET: ResolvedDataset = {
  name: 'main',
  datasetId: 'pixel-main',
  accessToken: 'token-main',
};

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function normalizedEvent(): MetaNormalizedEvent {
  return {
    eventName: 'Lead',
    eventTime: 1_700_000_000,
    actionSource: 'website',
    eventId: 'lead-1',
    userData: { email: 'joe@example.com', client_ip_address: '1.2.3.4' },
    customData: { currency: 'USD', content_name: 'Newsletter Signup', my_custom: 'x' },
  };
}

describe('BusinessSdkAdapter (ADR-10: the only SDK import site)', () => {
  it('builds a ServerEvent and returns the decoded response', async () => {
    const http = new CapturingHttpService(new EventResponse(2, [], 'trace-x', 'id-x', 2));
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    const result = await adapter.send(normalizedEvent(), DATASET);

    expect(result).toEqual({
      eventsReceived: 2,
      messages: [],
      fbtraceId: 'trace-x',
      id: 'id-x',
      numProcessedEntries: 2,
    });
  });

  it('sends to the dataset pixel with a per-call access token (ADR-1)', async () => {
    const http = new CapturingHttpService();
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    await adapter.send(normalizedEvent(), DATASET);

    expect(http.calls[0]?.url).toBe('https://graph.facebook.com/v24.0/pixel-main/events');
    expect(http.calls[0]?.params.access_token).toBe('token-main');
  });

  it('passes raw PII to the SDK, which hashes it exactly once (ADR-3)', async () => {
    const http = new CapturingHttpService();
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    await adapter.send(normalizedEvent(), DATASET);

    const data = http.calls[0]?.params.data as Array<Record<string, unknown>>;
    const userData = data[0]?.user_data as Record<string, unknown>;

    expect(userData.em).toEqual([sha256('joe@example.com')]);
    expect(userData.em).not.toEqual([sha256(sha256('joe@example.com'))]);
    expect(userData.client_ip_address).toBe('1.2.3.4');
  });

  it('maps custom data to snake_case and routes unknown keys through custom_properties', async () => {
    const http = new CapturingHttpService();
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    await adapter.send(normalizedEvent(), DATASET);

    const data = http.calls[0]?.params.data as Array<Record<string, unknown>>;
    const customData = data[0]?.custom_data as Record<string, unknown>;

    expect(customData).toMatchObject({
      currency: 'USD',
      content_name: 'Newsletter Signup',
      my_custom: 'x',
    });
  });

  it('sets the event defaults the SDK will not (ADR-2)', async () => {
    const http = new CapturingHttpService();
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    await adapter.send(normalizedEvent(), DATASET);

    const data = http.calls[0]?.params.data as Array<Record<string, unknown>>;

    expect(data[0]).toMatchObject({
      event_name: 'Lead',
      event_time: 1_700_000_000,
      action_source: 'website',
      event_id: 'lead-1',
    });
  });

  it('applies a dataset test event code only when configured (ADR-9)', async () => {
    const http = new CapturingHttpService();
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    await adapter.send(normalizedEvent(), { ...DATASET, testEventCode: 'TEST123' });
    expect(http.calls[0]?.params.test_event_code).toBe('TEST123');

    await adapter.send(normalizedEvent(), DATASET);
    expect(http.calls[1]?.params.test_event_code).toBeNull();
  });

  it('exposes a client handle bound to a dataset', async () => {
    const http = new CapturingHttpService();
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    const handle = adapter.createClientHandle(DATASET);

    expect(handle.datasetName).toBe('main');
    expect(handle.datasetId).toBe('pixel-main');
    await handle.send(normalizedEvent());
    expect(http.calls).toHaveLength(1);
  });

  it('sets the event source URL when present', async () => {
    const http = new CapturingHttpService();
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    await adapter.send(
      { ...normalizedEvent(), eventSourceUrl: 'https://example.com/lead' },
      DATASET,
    );

    const data = http.calls[0]?.params.data as Array<Record<string, unknown>>;
    expect(data[0]?.event_source_url).toBe('https://example.com/lead');
  });

  it('omits custom data entirely when there is nothing to send', async () => {
    const http = new CapturingHttpService();
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    await adapter.send({ ...normalizedEvent(), userData: {}, customData: {} }, DATASET);

    const data = http.calls[0]?.params.data as Array<Record<string, unknown>>;
    expect(data[0]?.custom_data).toBeUndefined();
    expect(data[0]?.user_data).toBeUndefined();
  });

  it('ignores unknown user-data fields and routes unknown custom fields to custom_properties', async () => {
    const http = new CapturingHttpService();
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    await adapter.send(
      { ...normalizedEvent(), userData: { mystery: 'x' }, customData: { only_unknown: 'y' } },
      DATASET,
    );

    const data = http.calls[0]?.params.data as Array<Record<string, unknown>>;
    const userData = data[0]?.user_data as Record<string, unknown>;
    const customData = data[0]?.custom_data as Record<string, unknown>;

    expect(userData?.mystery).toBeUndefined();
    expect(customData).toEqual({ only_unknown: 'y' });
  });

  it('skips undefined custom values', async () => {
    const http = new CapturingHttpService();
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    await adapter.send(
      { ...normalizedEvent(), customData: { currency: 'USD', ghost: undefined } },
      DATASET,
    );

    const data = http.calls[0]?.params.data as Array<Record<string, unknown>>;
    expect(data[0]?.custom_data).toEqual({ currency: 'USD' });
  });

  it('coerces a malformed response defensively', async () => {
    const malformed = new EventResponse(
      Number.NaN,
      undefined as unknown as string[],
      undefined as unknown as string,
      undefined as unknown as string,
      Number.NaN,
    );
    const http = new CapturingHttpService(malformed);
    const adapter = new BusinessSdkAdapter(http, new RecordingLogger());

    const result = await adapter.send(normalizedEvent(), DATASET);

    expect(result).toEqual({
      eventsReceived: 0,
      messages: [],
      fbtraceId: '',
      id: '',
      numProcessedEntries: 0,
    });
  });
});
