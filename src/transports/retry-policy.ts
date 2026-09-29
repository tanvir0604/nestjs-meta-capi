import {
  MetaCapiConfigurationError,
  MetaCapiRetryExhaustedError,
  MetaCapiValidationError,
  MetaCapiError,
} from '../errors/meta-capi.error';
import type { ResolvedRetryOptions } from '../config/meta-capi.options';

/**
 * Retry only classes of failure that can succeed on a later attempt
 * (SPEC.md §10.2): connection errors/timeouts (no status), HTTP 429 and 5xx.
 * Never authentication failures, validation errors, or other 4xx — those fail
 * identically and only multiply load.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof MetaCapiRetryExhaustedError) {
    return false;
  }
  if (error instanceof MetaCapiValidationError || error instanceof MetaCapiConfigurationError) {
    return false;
  }

  const status = error instanceof MetaCapiError ? error.context.status : undefined;
  if (status === undefined) {
    return true;
  }
  return status === 429 || status >= 500;
}

/**
 * Exponential backoff with jitter, capped at `maxDelayMs`. `attempt` is
 * 1-based (the delay *before* the given retry attempt).
 */
export function computeBackoffDelay(
  attempt: number,
  retry: Pick<ResolvedRetryOptions, 'initialDelayMs' | 'maxDelayMs'>,
  random: () => number = Math.random,
): number {
  const base = Math.min(retry.maxDelayMs, retry.initialDelayMs * 2 ** Math.max(0, attempt - 1));
  if (base <= 0) {
    return 0;
  }
  const jitter = 0.5 + random() * 0.5;
  return Math.round(base * jitter);
}
