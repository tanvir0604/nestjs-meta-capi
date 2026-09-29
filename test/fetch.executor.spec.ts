import { jest } from '@jest/globals';

import { createFetchExecutor } from '../src/clients/fetch.executor';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('createFetchExecutor', () => {
  it('POSTs the params as a JSON body and returns the parsed body', async () => {
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      json: async () => ({ events_received: 1 }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await createFetchExecutor()({
      url: 'https://graph.facebook.com/v24.0/pixel/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      params: { access_token: 'token-a', data: [] },
    });

    expect(response).toEqual({ status: 200, body: { events_received: 1 } });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ access_token: 'token-a', data: [] }));
  });

  it('omits the body for a GET request', async () => {
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      json: async () => ({}),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await createFetchExecutor()({
      url: 'https://graph.facebook.com/v24.0/pixel/events',
      method: 'GET',
      headers: {},
      params: { a: 1 },
    });

    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('falls back to an empty body when the response is not JSON', async () => {
    const fetchMock = jest.fn(async () => ({
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await createFetchExecutor()({
      url: 'https://graph.facebook.com/v24.0/pixel/events',
      method: 'POST',
      headers: {},
      params: {},
    });

    expect(response).toEqual({ status: 502, body: {} });
  });
});
