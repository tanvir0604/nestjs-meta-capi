import type { MetaCustomData } from './meta-custom-data';
import type { MetaEventContext, MetaRequestLike } from './meta-request';
import type { MetaUserData } from './meta-user-data';

/**
 * A mapper extracts a value from a successful handler result. The `request` and
 * `context` are provided for convenience but may be absent outside HTTP
 * contexts.
 */
export type MetaEventMapper<T, R> = (
  result: T,
  request: MetaRequestLike | undefined,
  context: MetaEventContext,
) => R;

/** A `eventId` value: a property path into the result, or a mapper. */
export type MetaEventIdSource<T> = string | MetaEventMapper<T, string | number | undefined>;

/** An `eventTime` value: a static value or a mapper. */
export type MetaEventTimeSource<T> = Date | number | MetaEventMapper<T, Date | number>;

/**
 * Declarative description of the event to send after a handler succeeds
 * (SPEC.md §5.2). Metadata only — the interceptor does all the work.
 */
export interface MetaEventOptions<T = unknown> {
  /** Required. The Meta event name, e.g. `'Lead'`, `'Purchase'`. */
  name: string;
  /** Overrides `@MetaDataset` on the method and controller. */
  dataset?: string;
  /** A property path into the result (e.g. `'id'`, `'lead.id'`) or a mapper. */
  eventId?: MetaEventIdSource<T>;
  /** Defaults to `'website'` (ADR-2). */
  actionSource?: string;
  /** Defaults to the moment the event is built (ADR-2). */
  eventTime?: MetaEventTimeSource<T>;
  user?: MetaEventMapper<T, MetaUserData | undefined>;
  customData?: MetaEventMapper<T, MetaCustomData | undefined>;
  /** Explicit opt-in only; overrides the dataset's code (ADR-9). */
  testEventCode?: string;
}

/**
 * The service-facing payload (SPEC.md §5.3). Everything request-derived is
 * optional so `track()` works outside an HTTP context.
 */
export interface MetaEventPayload {
  /** Dataset name; falls back to the configured default. */
  dataset?: string;
  eventName: string;
  eventId?: string | number;
  actionSource?: string;
  eventTime?: Date | number;
  userData?: MetaUserData;
  customData?: MetaCustomData;
  testEventCode?: string;
  request?: MetaRequestLike;
}
