import {
  MetaCapiDeliveryError,
  MetaCapiRetryExhaustedError,
  MetaCapiValidationError,
} from '../src/errors/meta-capi.error';
import { computeBackoffDelay, isRetryableError } from '../src/transports/retry-policy';

describe('isRetryableError (SPEC.md §10.2)', () => {
  it('retries 429 and 5xx', () => {
    expect(isRetryableError(new MetaCapiDeliveryError('x', { status: 429 }))).toBe(true);
    expect(isRetryableError(new MetaCapiDeliveryError('x', { status: 500 }))).toBe(true);
    expect(isRetryableError(new MetaCapiDeliveryError('x', { status: 503 }))).toBe(true);
  });

  it('retries connection errors (no HTTP status)', () => {
    expect(isRetryableError(new MetaCapiDeliveryError('network'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
  });

  it('never retries 4xx other than 429', () => {
    expect(isRetryableError(new MetaCapiDeliveryError('x', { status: 400 }))).toBe(false);
    expect(isRetryableError(new MetaCapiDeliveryError('x', { status: 401 }))).toBe(false);
    expect(isRetryableError(new MetaCapiDeliveryError('x', { status: 403 }))).toBe(false);
  });

  it('never retries validation or exhausted errors', () => {
    expect(isRetryableError(new MetaCapiValidationError('bad'))).toBe(false);
    expect(isRetryableError(new MetaCapiRetryExhaustedError('gone', { attempts: 3 }))).toBe(false);
  });
});

describe('computeBackoffDelay', () => {
  const retry = { initialDelayMs: 100, maxDelayMs: 1000 };

  it('grows exponentially with the attempt', () => {
    expect(computeBackoffDelay(1, retry, () => 1)).toBe(100);
    expect(computeBackoffDelay(2, retry, () => 1)).toBe(200);
    expect(computeBackoffDelay(3, retry, () => 1)).toBe(400);
  });

  it('caps the base delay at maxDelayMs', () => {
    expect(computeBackoffDelay(10, retry, () => 1)).toBe(1000);
  });

  it('applies jitter between 50% and 100% of the base', () => {
    expect(computeBackoffDelay(3, retry, () => 0)).toBe(200);
    expect(computeBackoffDelay(3, retry, () => 0.5)).toBe(300);
  });

  it('returns zero when the initial delay is zero', () => {
    expect(computeBackoffDelay(1, { initialDelayMs: 0, maxDelayMs: 0 })).toBe(0);
  });
});
