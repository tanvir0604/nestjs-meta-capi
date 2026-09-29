/**
 * Error model (see SPEC.md §8).
 *
 * Every error carries enough context to debug an event without exposing secrets
 * or raw PII. Never attach an access token or raw user data to `context`.
 */
export interface MetaCapiErrorContext {
  dataset?: string;
  eventName?: string;
  eventId?: string;
  fbtraceId?: string;
  status?: number;
  attempts?: number;
}

export class MetaCapiError extends Error {
  readonly context: MetaCapiErrorContext;

  constructor(message: string, context: MetaCapiErrorContext = {}) {
    super(message);
    this.name = new.target.name;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown at startup when configuration is missing or invalid (SPEC.md §7). */
export class MetaCapiConfigurationError extends MetaCapiError {}

/** Thrown when an event payload is not usable. */
export class MetaCapiValidationError extends MetaCapiError {}

/** Thrown when Meta rejected the request (non-2xx, or a body-level failure). */
export class MetaCapiDeliveryError extends MetaCapiError {}

/**
 * Thrown when every retry attempt failed; wraps the last delivery error so the
 * underlying cause is preserved on `cause`.
 */
export class MetaCapiRetryExhaustedError extends MetaCapiDeliveryError {
  override readonly cause?: unknown;

  constructor(message: string, context: MetaCapiErrorContext = {}, cause?: unknown) {
    super(message, context);
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
