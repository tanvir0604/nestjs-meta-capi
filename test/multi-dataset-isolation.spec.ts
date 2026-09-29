import { AdsPixel, EventRequest, FacebookAdsApi, ServerEvent } from 'facebook-nodejs-business-sdk';

import { HttpServiceTransport, type MetaHttpResponse } from '../src/clients/http-service.transport';

const buildEvent = (): ServerEvent =>
  new ServerEvent().setEventName('Lead').setEventTime(1_700_000_000).setActionSource('website');

const PIXEL_FROM_URL = /graph\.facebook\.com\/v[\d.]+\/([^/]+)\/events$/;

interface Dataset {
  token: string;
  pixel: string;
}

interface ObservedCall {
  token: string;
  pixel: string;
  globalDefaultToken: string | undefined;
}

const DATASETS: Dataset[] = [
  { token: 'token-primary', pixel: 'pixel-primary' },
  { token: 'token-marketing', pixel: 'pixel-marketing' },
  { token: 'token-partner', pixel: 'pixel-partner' },
];

describe('Spike 1 — multi-dataset token isolation (ADR-1)', () => {
  it('never bleeds tokens across datasets when sent through HttpServiceTransport', async () => {
    const calls: ObservedCall[] = [];

    const transport = new HttpServiceTransport(async (request) => {
      const match = PIXEL_FROM_URL.exec(request.url);
      if (!match?.[1]) {
        throw new Error(`Unexpected request URL: ${request.url}`);
      }
      if (typeof request.params.access_token !== 'string') {
        throw new Error('access_token missing from request params');
      }
      calls.push({
        token: request.params.access_token,
        pixel: match[1],
        globalDefaultToken: FacebookAdsApi.getDefaultApi()?.accessToken,
      });
      return {
        status: 200,
        body: {
          events_received: 1,
          messages: [],
          fbtrace_id: 'trace-1',
          id: 'ds-1',
          num_processed_entries: 1,
        },
      } satisfies MetaHttpResponse;
    });

    // Construct every request first — each constructor mutates the global
    // singleton — then execute them together. This is the interleaving that
    // breaks the SDK's default (non-custom) path.
    const requests = DATASETS.map((dataset) =>
      new EventRequest(dataset.token, dataset.pixel)
        .setEvents([buildEvent()])
        .setHttpService(transport),
    );

    await Promise.all(requests.map((request) => request.execute()));

    expect(calls).toHaveLength(DATASETS.length);

    for (const dataset of DATASETS) {
      const call = calls.find((entry) => entry.pixel === dataset.pixel);
      expect(call).toBeDefined();
      expect(call?.token).toBe(dataset.token);
    }

    // Proof the isolation is real and not an artefact of the global being
    // correct: at execution time the global singleton held a *different*
    // dataset's token, yet each request still used its own.
    const mismatched = calls.filter((call) => call.globalDefaultToken !== call.token);
    expect(mismatched.length).toBeGreaterThanOrEqual(DATASETS.length - 1);
  });

  it('proves the documented hazard on the SDK default path', () => {
    // Sanity: the SDK really does keep a process-global default API.
    new EventRequest('token-a', 'pixel-a');
    new EventRequest('token-b', 'pixel-b');

    // Constructing a request replaces the global access token with the last one.
    expect(FacebookAdsApi.getDefaultApi()?.accessToken).toBe('token-b');

    // An object bound to pixel-a now resolves to whichever token was set last —
    // exactly the cross-contamination ADR-1 exists to prevent.
    expect(new AdsPixel('pixel-a').getApi().accessToken).toBe('token-b');
  });
});
