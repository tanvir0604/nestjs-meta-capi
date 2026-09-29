import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ParamBuilder } from 'capi-param-builder-nodejs';
import { mergeMap, type Observable } from 'rxjs';

import { extractRequestContext, type MetaRequestContext } from '../clients/request-context';
import type { ResolvedMetaCapiOptions } from '../config/meta-capi.options';
import {
  META_CAPI_LOGGER,
  META_CAPI_OPTIONS,
  META_CAPI_PARAM_BUILDER_FACTORY,
} from '../config/meta-capi.tokens';
import { META_DATASET_METADATA } from '../decorators/meta-dataset.decorator';
import { META_EVENT_METADATA } from '../decorators/meta-event.decorator';
import { writeSetCookies } from '../http/cookie-writer';
import type { MetaCapiLogger } from '../logging/meta-capi.logger';
import { MetaCapiService } from '../services/meta-capi.service';
import type { MetaEventContext, MetaRequestLike } from '../types/meta-request';
import type {
  MetaEventIdSource,
  MetaEventOptions,
  MetaEventPayload,
  MetaEventTimeSource,
} from '../types/meta-event';

/**
 * Metadata-gated, globally-registered dispatcher (ADR-4).
 *
 * For a route with `@MetaEvent`, the event is sent *after* the handler
 * resolves, and only for a successful (2xx) response (ADR-7). If the handler
 * throws, nothing is sent and the original exception propagates unchanged
 * (invariant 3).
 */
@Injectable()
export class MetaEventInterceptor implements NestInterceptor {
  constructor(
    @Inject(META_CAPI_OPTIONS) private readonly options: ResolvedMetaCapiOptions,
    @Inject(META_CAPI_LOGGER) private readonly logger: MetaCapiLogger,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(MetaCapiService) private readonly service: MetaCapiService,
    @Inject(META_CAPI_PARAM_BUILDER_FACTORY)
    private readonly createParamBuilder: () => ParamBuilder,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const handler = context.getHandler();
    const eventOptions = this.reflector.get<MetaEventOptions | undefined>(
      META_EVENT_METADATA,
      handler,
    );

    if (eventOptions === undefined) {
      return next.handle();
    }

    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        if (this.isSuccessfulResponse(context)) {
          await this.dispatch(eventOptions, result, context);
        } else {
          this.logger.warn('Meta event skipped: handler did not return a 2xx response', {
            eventName: eventOptions.name,
          });
        }
        return result;
      }),
    );
  }

  private async dispatch(
    eventOptions: MetaEventOptions,
    result: unknown,
    context: ExecutionContext,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<MetaRequestLike>();

    // Only extract here when cookie write-back is on; otherwise the transport
    // owns extraction and we avoid doing it twice.
    const requestContext = this.options.cookies.enabled
      ? extractRequestContext(request, this.createParamBuilder)
      : undefined;

    if (requestContext !== undefined) {
      this.writeCookies(requestContext, context);
    }

    await this.service.track(this.buildPayload(eventOptions, result, context), requestContext);
  }

  /** Best-effort write-back of `_fbc`/`_fbp` (ADR-8). */
  private writeCookies(requestContext: MetaRequestContext, context: ExecutionContext): void {
    if (requestContext.cookiesToSet.length === 0) {
      return;
    }
    const response = context.switchToHttp().getResponse<Parameters<typeof writeSetCookies>[0]>();
    const written = writeSetCookies(response, requestContext.cookiesToSet);
    if (written > 0) {
      this.logger.debug('Wrote Meta attribution cookies', { count: written });
    }
  }

  private buildPayload(
    eventOptions: MetaEventOptions,
    result: unknown,
    context: ExecutionContext,
  ): MetaEventPayload {
    const request = context.switchToHttp().getRequest<MetaRequestLike>();
    const dataset = this.resolveDatasetName(eventOptions, context);
    const mapperContext: MetaEventContext = dataset === undefined ? {} : { dataset };

    const payload: MetaEventPayload = { eventName: eventOptions.name, request };

    if (dataset !== undefined) {
      payload.dataset = dataset;
    }
    if (eventOptions.actionSource !== undefined) {
      payload.actionSource = eventOptions.actionSource;
    }
    if (eventOptions.testEventCode !== undefined) {
      payload.testEventCode = eventOptions.testEventCode;
    }

    if (eventOptions.user !== undefined) {
      const userData = eventOptions.user(result, request, mapperContext);
      if (userData !== undefined) {
        payload.userData = userData;
      }
    }
    if (eventOptions.customData !== undefined) {
      const customData = eventOptions.customData(result, request, mapperContext);
      if (customData !== undefined) {
        payload.customData = customData;
      }
    }

    const eventId = resolveEventId(eventOptions.eventId, result, request, mapperContext);
    if (eventId !== undefined) {
      payload.eventId = eventId;
    }

    const eventTime = resolveEventTime(eventOptions.eventTime, result, request, mapperContext);
    if (eventTime !== undefined) {
      payload.eventTime = eventTime;
    }

    return payload;
  }

  private resolveDatasetName(
    eventOptions: MetaEventOptions,
    context: ExecutionContext,
  ): string | undefined {
    if (eventOptions.dataset !== undefined) {
      return eventOptions.dataset;
    }
    const methodLevel = this.reflector.get<string | undefined>(
      META_DATASET_METADATA,
      context.getHandler(),
    );
    if (methodLevel !== undefined) {
      return methodLevel;
    }
    return this.reflector.get<string | undefined>(META_DATASET_METADATA, context.getClass());
  }

  private isSuccessfulResponse(context: ExecutionContext): boolean {
    const response = context.switchToHttp().getResponse<{ statusCode?: number }>();
    const status = response.statusCode ?? 200;
    return status >= 200 && status < 300;
  }
}

function readPropertyPath(source: unknown, path: string): string | number | undefined {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' || typeof current === 'number' ? current : undefined;
}

function resolveEventId(
  source: MetaEventIdSource<unknown> | undefined,
  result: unknown,
  request: MetaRequestLike,
  context: MetaEventContext,
): string | number | undefined {
  if (source === undefined) {
    return undefined;
  }
  if (typeof source === 'function') {
    return source(result, request, context) ?? undefined;
  }
  return readPropertyPath(result, source);
}

function resolveEventTime(
  source: MetaEventTimeSource<unknown> | undefined,
  result: unknown,
  request: MetaRequestLike,
  context: MetaEventContext,
): Date | number | undefined {
  if (source === undefined) {
    return undefined;
  }
  return typeof source === 'function' ? source(result, request, context) : source;
}
