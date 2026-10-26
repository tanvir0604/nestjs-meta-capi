import { EventResponse, type HttpServiceInterface } from 'facebook-nodejs-business-sdk';

import { MetaCapiDeliveryError } from '../errors/meta-capi.error';

/** A single request the SDK wants us to perform. */
export interface MetaHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  params: Record<string, unknown>;
}

/** The raw result of performing a {@link MetaHttpRequest}. */
export interface MetaHttpResponse {
  status: number;
  body: unknown;
}

/** Injectable transport seam — swappable in tests and for custom agents/proxies. */
export type MetaHttpExecutor = (request: MetaHttpRequest) => Promise<MetaHttpResponse>;

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/** Graph API version used for sends; the SDK itself is pinned to `v24.0`. */
export const DEFAULT_GRAPH_API_VERSION = 'v26.0';

const GRAPH_VERSION_SEGMENT = /\/v\d+\.\d+(?=\/)/;

/**
 * Default send path for the package (ADR-1).
 *
 * `EventRequest`'s constructor calls `FacebookAdsApi.init()`, which mutates a
 * process-global singleton. Supplying a custom `HttpServiceInterface` makes the
 * SDK bypass that singleton entirely: the request carries the per-call
 * `access_token` as a parameter, so concurrently sending to datasets with
 * different tokens cannot cross-contaminate.
 *
 * The SDK returns whatever `executeRequest` resolves to, directly, as the value
 * of `EventRequest.execute()` — so this MUST resolve to an `EventResponse`.
 */
export class HttpServiceTransport implements HttpServiceInterface {
  constructor(
    private readonly execute: MetaHttpExecutor,
    private readonly graphApiVersion: string = DEFAULT_GRAPH_API_VERSION,
  ) {}

  async executeRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    params: Record<string, unknown>,
  ): Promise<EventResponse> {
    // The published SDK hardcodes its Graph version (`v24.0`); rewrite it here.
    const versionedUrl = url.replace(GRAPH_VERSION_SEGMENT, `/${this.graphApiVersion}`);
    const response = await this.execute({ url: versionedUrl, method, headers, params });
    const body =
      response.body !== null && typeof response.body === 'object'
        ? (response.body as Record<string, unknown>)
        : {};

    if (response.status < 200 || response.status >= 300) {
      throw new MetaCapiDeliveryError('Meta rejected the event request', {
        status: response.status,
        fbtraceId: asString(body.fbtrace_id),
      });
    }

    return new EventResponse(
      asNumber(body.events_received),
      asStringArray(body.messages),
      asString(body.fbtrace_id),
      asString(body.id),
      asNumber(body.num_processed_entries),
    );
  }
}

/** The minimal shape needed to judge delivery success. */
export interface DeliveryResult {
  eventsReceived: number;
  messages: string[];
}

/**
 * Body-aware success detection (ADR-5 / §10.3).
 *
 * A 2xx is not proof of success: Meta can return 200 with per-event errors in
 * `messages` and/or `events_received: 0`. Logging and retry classification MUST
 * use this instead of the HTTP status alone.
 */
export function isDeliverySuccessful(result: DeliveryResult): boolean {
  return result.messages.length === 0 && result.eventsReceived >= 1;
}
