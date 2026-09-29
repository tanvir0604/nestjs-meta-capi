import type { ResolvedDataset } from '../config/meta-capi.options';

/** User data after the builder has mapped it to snake_case keys (raw values). */
export type MetaNormalizedUserData = Record<string, string>;

/** Custom data after the builder has mapped it to snake_case keys. */
export type MetaNormalizedCustomData = Record<string, unknown>;

/**
 * Everything the adapter needs to build a `ServerEvent`. Request-derived values
 * (fbc/fbp/IP/user agent/event source URL) are already merged in.
 */
export interface MetaNormalizedEvent {
  eventName: string;
  eventTime: number;
  actionSource: string;
  eventId?: string;
  userData: MetaNormalizedUserData;
  customData: MetaNormalizedCustomData;
  eventSourceUrl?: string;
}

/** The decoded outcome of a single Meta send. */
export interface MetaSendResult {
  eventsReceived: number;
  messages: string[];
  fbtraceId: string;
  id: string;
  numProcessedEntries: number;
}

/**
 * The escape-hatch handle returned by `MetaCapiService.getClient()` (SPEC.md
 * §5.4). It exposes the adapter, never raw SDK types (ADR-10).
 */
export interface MetaSdkClientHandle {
  readonly datasetName: string;
  readonly datasetId: string;
  send(event: MetaNormalizedEvent): Promise<MetaSendResult>;
}

/**
 * The single seam between this package and Meta's SDK (ADR-10). Only
 * `BusinessSdkAdapter` implements it; nothing else imports the SDK.
 */
export interface MetaSdkAdapter {
  send(event: MetaNormalizedEvent, dataset: ResolvedDataset): Promise<MetaSendResult>;
  createClientHandle(dataset: ResolvedDataset): MetaSdkClientHandle;
}
