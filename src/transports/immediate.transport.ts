import { Inject, Injectable } from '@nestjs/common';
import type { ParamBuilder } from 'capi-param-builder-nodejs';

import { buildNormalizedEvent } from '../builders/event.builder';
import { isDeliverySuccessful } from '../clients/http-service.transport';
import type { MetaNormalizedEvent, MetaSdkAdapter } from '../clients/meta-sdk.adapter';
import { extractRequestContext, type MetaRequestContext } from '../clients/request-context';
import {
  META_CAPI_ADAPTER,
  META_CAPI_LOGGER,
  META_CAPI_OPTIONS,
  META_CAPI_PARAM_BUILDER_FACTORY,
} from '../config/meta-capi.tokens';
import type { ResolvedDataset, ResolvedMetaCapiOptions } from '../config/meta-capi.options';
import {
  MetaCapiConfigurationError,
  MetaCapiDeliveryError,
  MetaCapiError,
  MetaCapiRetryExhaustedError,
  type MetaCapiErrorContext,
} from '../errors/meta-capi.error';
import type { MetaCapiLogger } from '../logging/meta-capi.logger';
import type { MetaEventPayload } from '../types/meta-event';
import type { MetaEventTransport } from './meta-event.transport';
import { computeBackoffDelay, isRetryableError } from './retry-policy';

/**
 * The default transport: resolves the dataset, normalizes the event (including
 * request context), and delivers via the adapter with retries.
 *
 * It does not decide *when* to send — the interceptor/service do that. This
 * keeps `async` fire-and-forget honest: the only thing off the request path is
 * the awaited work inside `send`.
 */
@Injectable()
export class ImmediateTransport implements MetaEventTransport {
  constructor(
    @Inject(META_CAPI_OPTIONS) private readonly options: ResolvedMetaCapiOptions,
    @Inject(META_CAPI_ADAPTER) private readonly adapter: MetaSdkAdapter,
    @Inject(META_CAPI_LOGGER) private readonly logger: MetaCapiLogger,
    @Inject(META_CAPI_PARAM_BUILDER_FACTORY)
    private readonly createParamBuilder: () => ParamBuilder,
  ) {}

  async send(payload: MetaEventPayload, context?: MetaRequestContext): Promise<void> {
    const dataset = this.resolveDataset(payload.dataset);
    const requestContext =
      context ?? extractRequestContext(payload.request, this.createParamBuilder);

    const event = buildNormalizedEvent({
      eventName: payload.eventName,
      ...(payload.actionSource !== undefined ? { actionSource: payload.actionSource } : {}),
      ...(payload.eventTime !== undefined ? { eventTime: payload.eventTime } : {}),
      ...(payload.eventId !== undefined ? { eventId: payload.eventId } : {}),
      ...(payload.userData !== undefined ? { userData: payload.userData } : {}),
      ...(payload.customData !== undefined ? { customData: payload.customData } : {}),
      requestContext,
    });

    const testEventCode = payload.testEventCode ?? dataset.testEventCode;
    const target: ResolvedDataset =
      testEventCode !== undefined ? { ...dataset, testEventCode } : dataset;

    await this.deliver(event, target);
  }

  private resolveDataset(name?: string): ResolvedDataset {
    const datasetName = name ?? this.options.defaultDataset;
    const dataset = this.options.datasets[datasetName];
    if (dataset === undefined) {
      throw new MetaCapiConfigurationError(`Meta CAPI: unknown dataset "${datasetName}".`, {
        dataset: datasetName,
      });
    }
    return dataset;
  }

  private async deliver(event: MetaNormalizedEvent, dataset: ResolvedDataset): Promise<void> {
    const { retry } = this.options;
    const maxAttempts = retry.enabled ? retry.maxAttempts : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await this.adapter.send(event, dataset);

        if (!isDeliverySuccessful(result)) {
          const context: MetaCapiErrorContext = {
            dataset: dataset.name,
            eventName: event.eventName,
            fbtraceId: result.fbtraceId,
            status: 200,
            attempts: attempt,
          };
          if (event.eventId !== undefined) {
            context.eventId = event.eventId;
          }
          throw new MetaCapiDeliveryError('Meta did not accept the event.', context);
        }

        this.logger.debug('Meta event delivered', {
          dataset: dataset.name,
          eventName: event.eventName,
          eventId: event.eventId,
          eventsReceived: result.eventsReceived,
          fbtraceId: result.fbtraceId,
          attempts: attempt,
        });
        return;
      } catch (error) {
        const canRetry = attempt < maxAttempts && isRetryableError(error);

        if (!canRetry) {
          throw this.wrapError(error, attempt, event, dataset);
        }

        const delay = computeBackoffDelay(attempt, retry);
        this.logger.warn('Meta event delivery failed; retrying', {
          dataset: dataset.name,
          eventName: event.eventName,
          eventId: event.eventId,
          attempt,
          nextDelayMs: delay,
        });
        if (delay > 0) {
          await this.delay(delay);
        }
      }
    }
  }

  private wrapError(
    error: unknown,
    attempt: number,
    event: MetaNormalizedEvent,
    dataset: ResolvedDataset,
  ): unknown {
    if (
      attempt > 1 &&
      error instanceof MetaCapiDeliveryError &&
      !(error instanceof MetaCapiRetryExhaustedError)
    ) {
      const context = {
        dataset: dataset.name,
        eventName: event.eventName,
        attempts: attempt,
        ...(event.eventId !== undefined ? { eventId: event.eventId } : {}),
        ...(error.context.status !== undefined ? { status: error.context.status } : {}),
        ...(error.context.fbtraceId !== undefined ? { fbtraceId: error.context.fbtraceId } : {}),
      };
      return new MetaCapiRetryExhaustedError(
        `Meta event delivery failed after ${attempt} attempts.`,
        context,
        error,
      );
    }
    if (error instanceof MetaCapiError) {
      return error;
    }
    return new MetaCapiDeliveryError('Meta event delivery failed.', {
      dataset: dataset.name,
      eventName: event.eventName,
      attempts: attempt,
    });
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
