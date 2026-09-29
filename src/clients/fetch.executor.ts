import type { MetaHttpExecutor, MetaHttpResponse } from './http-service.transport';

/**
 * Default `MetaHttpExecutor`: performs the request Meta's SDK asks for using
 * the platform `fetch` available on Node >= 20.
 *
 * The SDK supplies the per-call `access_token` inside `params`, so we simply
 * serialize the params as the JSON body — this is what keeps multi-dataset
 * sends isolated (ADR-1).
 */
export function createFetchExecutor(): MetaHttpExecutor {
  return async ({ url, method, headers, params }): Promise<MetaHttpResponse> => {
    const init: RequestInit = { method, headers };
    if (method.toUpperCase() !== 'GET') {
      init.body = JSON.stringify(params);
    }

    const response = await fetch(url, init);

    let body: unknown = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }

    return { status: response.status, body };
  };
}
