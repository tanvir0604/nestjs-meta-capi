import {
  MetaCapiConfigurationError,
  MetaCapiDeliveryError,
  MetaCapiError,
  MetaCapiRetryExhaustedError,
  MetaCapiValidationError,
} from '../src/errors/meta-capi.error';

describe('MetaCapiError model (SPEC.md §8)', () => {
  it('preserves the subclass name and context', () => {
    const error = new MetaCapiDeliveryError('nope', { dataset: 'main', status: 500 });

    expect(error).toBeInstanceOf(MetaCapiError);
    expect(error).toBeInstanceOf(MetaCapiDeliveryError);
    expect(error.name).toBe('MetaCapiDeliveryError');
    expect(error.context).toEqual({ dataset: 'main', status: 500 });
    expect(error.message).toBe('nope');
  });

  it('defaults context to an empty object', () => {
    expect(new MetaCapiConfigurationError('bad').context).toEqual({});
    expect(new MetaCapiValidationError('bad').context).toEqual({});
  });

  it('wraps a cause when one is provided and omits it otherwise', () => {
    const cause = new MetaCapiDeliveryError('root', { status: 503 });
    const withCause = new MetaCapiRetryExhaustedError('gone', { attempts: 3 }, cause);

    expect(withCause).toBeInstanceOf(MetaCapiDeliveryError);
    expect(withCause.cause).toBe(cause);

    expect(new MetaCapiRetryExhaustedError('gone').cause).toBeUndefined();
  });

  it('keeps instanceof working across the prototype chain', () => {
    expect(new MetaCapiRetryExhaustedError('x')).toBeInstanceOf(MetaCapiError);
  });
});
