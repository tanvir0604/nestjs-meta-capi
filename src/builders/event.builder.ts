import type { MetaNormalizedEvent, MetaNormalizedUserData } from '../clients/meta-sdk.adapter';
import type { MetaRequestContext } from '../clients/request-context';
import { MetaCapiValidationError } from '../errors/meta-capi.error';
import type { MetaCustomData } from '../types/meta-custom-data';
import type { MetaUserData } from '../types/meta-user-data';
import { buildCustomData } from './custom-data.builder';
import { buildUserData } from './user-data.builder';

/** The default Meta requires but the SDK does not supply (ADR-2). */
export const DEFAULT_ACTION_SOURCE = 'website';

/** Values at or above this are milliseconds, not seconds. */
const MILLISECOND_THRESHOLD = 1e12;

/**
 * Resolve `event_time` to Unix seconds, defaulting to now. Captured once at
 * construction so retries do not shift it (§6, ADR-2). Millisecond inputs
 * (`Date.now()`) are detected and converted.
 */
export function resolveEventTime(value?: Date | number): number {
  if (value === undefined) {
    return Math.floor(Date.now() / 1000);
  }
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  if (!Number.isFinite(value)) {
    throw new MetaCapiValidationError('Meta CAPI: "eventTime" must be a finite number or a Date.');
  }
  return value >= MILLISECOND_THRESHOLD ? Math.floor(value / 1000) : Math.floor(value);
}

export interface BuildEventInput {
  eventName: string;
  actionSource?: string;
  eventTime?: Date | number;
  eventId?: string | number;
  userData?: MetaUserData;
  customData?: MetaCustomData;
  requestContext?: MetaRequestContext;
}

/**
 * Assemble the normalized event the adapter consumes: apply defaults, merge
 * request-derived values (explicit user data always wins), and map custom data
 * to snake_case.
 */
export function buildNormalizedEvent(input: BuildEventInput): MetaNormalizedEvent {
  const eventName = input.eventName?.trim();
  if (!eventName) {
    throw new MetaCapiValidationError('Meta CAPI: "eventName" is required.');
  }

  const context = input.requestContext;

  const userData: MetaNormalizedUserData = {};
  if (context?.fbc !== undefined) {
    userData.fbc = context.fbc;
  }
  if (context?.fbp !== undefined) {
    userData.fbp = context.fbp;
  }
  if (context?.clientIpAddress !== undefined) {
    userData.client_ip_address = context.clientIpAddress;
  }
  if (context?.clientUserAgent !== undefined) {
    userData.client_user_agent = context.clientUserAgent;
  }
  Object.assign(userData, buildUserData(input.userData));

  const event: MetaNormalizedEvent = {
    eventName,
    eventTime: resolveEventTime(input.eventTime),
    actionSource: input.actionSource ?? DEFAULT_ACTION_SOURCE,
    userData,
    customData: buildCustomData(input.customData),
  };

  if (input.eventId !== undefined) {
    event.eventId = String(input.eventId);
  }
  if (context?.eventSourceUrl !== undefined) {
    event.eventSourceUrl = context.eventSourceUrl;
  }

  return event;
}
