import { CustomData, EventRequest, ServerEvent, UserData } from 'facebook-nodejs-business-sdk';

import type { ResolvedDataset } from '../config/meta-capi.options';
import type { MetaCapiLogger } from '../logging/meta-capi.logger';
import type {
  MetaNormalizedCustomData,
  MetaNormalizedEvent,
  MetaNormalizedUserData,
  MetaSdkAdapter,
  MetaSdkClientHandle,
  MetaSendResult,
} from './meta-sdk.adapter';
import type { HttpServiceInterface } from 'facebook-nodejs-business-sdk';

/** `snake_case` field name → SDK setter name (`content_name` → `setContentName`). */
function toSetterName(key: string): string {
  const pascal = key
    .split('_')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
  return `set${pascal}`;
}

/**
 * Apply snake_case fields to an SDK object via its `setX` methods. Returns the
 * fields the object has no setter for, so the caller can route them to
 * `setCustomProperties`.
 */
function applySetters(
  host: object,
  data: Record<string, unknown>,
  leftovers?: Record<string, unknown>,
): number {
  let applied = 0;

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }
    const candidate = (host as Record<string, unknown>)[toSetterName(key)];
    if (typeof candidate === 'function') {
      (candidate as (argument: unknown) => unknown).call(host, value);
      applied += 1;
    } else if (leftovers !== undefined) {
      leftovers[key] = value;
    }
  }

  return applied;
}

function buildUserData(data: MetaNormalizedUserData): UserData {
  const userData = new UserData();
  applySetters(userData, data);
  return userData;
}

function buildCustomData(data: MetaNormalizedCustomData): CustomData | undefined {
  const customData = new CustomData();
  const leftovers: Record<string, unknown> = {};
  const applied = applySetters(customData, data, leftovers);
  if (Object.keys(leftovers).length > 0) {
    customData.setCustomProperties(leftovers);
  }
  return applied === 0 && Object.keys(leftovers).length === 0 ? undefined : customData;
}

function mapResponse(response: {
  events_received: number;
  messages: string[];
  fbtrace_id: string;
  id: string;
  num_processed_entries: number;
}): MetaSendResult {
  return {
    eventsReceived: Number.isFinite(response.events_received) ? response.events_received : 0,
    messages: Array.isArray(response.messages) ? response.messages : [],
    fbtraceId: response.fbtrace_id ?? '',
    id: response.id ?? '',
    numProcessedEntries: Number.isFinite(response.num_processed_entries)
      ? response.num_processed_entries
      : 0,
  };
}

/**
 * The ONLY place the official SDK is constructed (ADR-10). Everything above it
 * talks in our own types.
 *
 * Sends always go through the injected `HttpServiceInterface`, never the SDK's
 * global default path, so concurrent multi-dataset sends cannot leak tokens
 * (ADR-1).
 */
export class BusinessSdkAdapter implements MetaSdkAdapter {
  constructor(
    private readonly httpService: HttpServiceInterface,
    private readonly logger: MetaCapiLogger,
  ) {}

  async send(event: MetaNormalizedEvent, dataset: ResolvedDataset): Promise<MetaSendResult> {
    const serverEvent = new ServerEvent()
      .setEventName(event.eventName)
      .setEventTime(event.eventTime)
      .setActionSource(event.actionSource);

    if (event.eventId !== undefined) {
      serverEvent.setEventId(event.eventId);
    }
    if (event.eventSourceUrl !== undefined) {
      serverEvent.setEventSourceUrl(event.eventSourceUrl);
    }
    if (Object.keys(event.userData).length > 0) {
      serverEvent.setUserData(buildUserData(event.userData));
    }

    const customData = buildCustomData(event.customData);
    if (customData !== undefined) {
      serverEvent.setCustomData(customData);
    }

    const request = new EventRequest(dataset.accessToken, dataset.datasetId)
      .setEvents([serverEvent])
      .setHttpService(this.httpService);

    if (dataset.testEventCode !== undefined) {
      request.setTestEventCode(dataset.testEventCode);
    }

    this.logger.debug('Sending Meta event', {
      dataset: dataset.name,
      eventName: event.eventName,
      eventId: event.eventId,
    });

    const response = await request.execute();
    return mapResponse(response);
  }

  createClientHandle(dataset: ResolvedDataset): MetaSdkClientHandle {
    return {
      datasetName: dataset.name,
      datasetId: dataset.datasetId,
      send: (event: MetaNormalizedEvent) => this.send(event, dataset),
    };
  }
}
