/**
 * Public API surface (see SPEC.md §5).
 *
 * Only intentional, stable exports belong here. The SDK is never reachable
 * directly — `getClient()` returns our own handle (ADR-10). Internal classes
 * (`BusinessSdkAdapter`, `HttpServiceTransport`, `ImmediateTransport`,
 * `StructuredLogger`) are deliberately not exported.
 */

// Module + configuration
export { MetaCapiModule } from './meta-capi.module';
export type {
  CookieOptions,
  DatasetConfig,
  DeliveryMode,
  DeliveryOptions,
  LoggingOptions,
  LogLevel,
  MetaCapiModuleAsyncOptions,
  MetaCapiModuleOptions,
  ResolvedCookieOptions,
  ResolvedMetaCapiOptions,
  ResolvedDataset,
  RetryOptions,
} from './config/meta-capi.options';

// Decorators
export { MetaEvent } from './decorators/meta-event.decorator';
export { MetaDataset } from './decorators/meta-dataset.decorator';

// Service
export { MetaCapiService } from './services/meta-capi.service';

// Transports (the seam for custom delivery, ADR-6)
export type { MetaEventTransport } from './transports/meta-event.transport';

// Request context (extracted by the HTTP layer, reused by transports)
export type { MetaRequestContext } from './clients/request-context';

// Adapter handle + normalized shapes used by `getClient()`
export type {
  MetaNormalizedCustomData,
  MetaNormalizedEvent,
  MetaNormalizedUserData,
  MetaSdkClientHandle,
  MetaSendResult,
} from './clients/meta-sdk.adapter';

// Public types
export type {
  MetaEventIdSource,
  MetaEventMapper,
  MetaEventOptions,
  MetaEventPayload,
  MetaEventTimeSource,
} from './types/meta-event';
export type { MetaCustomData, MetaCustomDataContent } from './types/meta-custom-data';
export type { MetaEventContext, MetaRequestLike } from './types/meta-request';
export type { MetaUserData } from './types/meta-user-data';

// Errors
export {
  MetaCapiConfigurationError,
  MetaCapiDeliveryError,
  MetaCapiError,
  MetaCapiRetryExhaustedError,
  MetaCapiValidationError,
  type MetaCapiErrorContext,
} from './errors/meta-capi.error';
