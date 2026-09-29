import { Inject, Injectable } from '@nestjs/common';

import type { MetaRequestContext } from '../clients/request-context';
import type { MetaSdkAdapter, MetaSdkClientHandle } from '../clients/meta-sdk.adapter';
import {
  META_CAPI_ADAPTER,
  META_CAPI_LOGGER,
  META_CAPI_OPTIONS,
  META_CAPI_TRANSPORT,
} from '../config/meta-capi.tokens';
import type { ResolvedDataset, ResolvedMetaCapiOptions } from '../config/meta-capi.options';
import { MetaCapiConfigurationError, MetaCapiValidationError } from '../errors/meta-capi.error';
import type { MetaCapiLogger } from '../logging/meta-capi.logger';
import type { MetaEventPayload } from '../types/meta-event';
import type { MetaEventTransport } from '../transports/meta-event.transport';

/**
 * The public service (SPEC.md §5.3). Works with or without decorators and
 * outside an HTTP context — everything request-derived degrades gracefully to
 * absent.
 */
@Injectable()
export class MetaCapiService {
  constructor(
    @Inject(META_CAPI_OPTIONS) private readonly options: ResolvedMetaCapiOptions,
    @Inject(META_CAPI_TRANSPORT) private readonly transport: MetaEventTransport,
    @Inject(META_CAPI_LOGGER) private readonly logger: MetaCapiLogger,
    @Inject(META_CAPI_ADAPTER) private readonly adapter: MetaSdkAdapter,
  ) {}

  /**
   * Send an event. In `async` mode (default) this returns as soon as the send
   * is scheduled; a delivery failure is logged, never thrown (ADR-6). In `sync`
   * mode it awaits the send and a failure surfaces to the caller.
   *
   * @param context Request context already extracted by the HTTP layer. When
   *   omitted, the transport extracts it from `payload.request`.
   */
  async track(payload: MetaEventPayload, context?: MetaRequestContext): Promise<void> {
    if (payload.eventName === undefined || payload.eventName.trim() === '') {
      throw new MetaCapiValidationError('Meta CAPI: "eventName" is required.');
    }

    if (this.options.delivery.mode === 'sync') {
      await this.transport.send(payload, context);
      return;
    }

    void this.transport
      .send(payload, context)
      .catch((error: unknown) => this.logDeliveryFailure(payload, error));
  }

  /** The adapter handle for a dataset (SPEC.md §5.4). */
  getClient(datasetName?: string): MetaSdkClientHandle {
    const name = datasetName ?? this.options.defaultDataset;
    const dataset: ResolvedDataset | undefined = this.options.datasets[name];
    if (dataset === undefined) {
      throw new MetaCapiConfigurationError(`Meta CAPI: unknown dataset "${name}".`, {
        dataset: name,
      });
    }
    return this.adapter.createClientHandle(dataset);
  }

  private logDeliveryFailure(payload: MetaEventPayload, error: unknown): void {
    this.logger.error('Meta CAPI delivery failed', {
      dataset: payload.dataset ?? this.options.defaultDataset,
      eventName: payload.eventName,
      ...describeError(error),
    });
  }
}

function describeError(error: unknown): { error: string } {
  if (error instanceof Error) {
    return { error: error.name };
  }
  return { error: 'UnknownError' };
}
