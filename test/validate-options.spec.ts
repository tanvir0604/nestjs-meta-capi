import { MetaCapiConfigurationError } from '../src/errors/meta-capi.error';
import { resolveOptions } from '../src/config/validate-options';

describe('resolveOptions (SPEC.md §7)', () => {
  it('applies defaults when only datasets are supplied', () => {
    const options = resolveOptions({
      datasets: { primary: { datasetId: '123', accessToken: 'secret-token' } },
    });

    expect(options.defaultDataset).toBe('primary');
    expect(options.delivery.mode).toBe('async');
    expect(options.retry).toEqual({
      enabled: true,
      maxAttempts: 3,
      initialDelayMs: 500,
      maxDelayMs: 10_000,
    });
    expect(options.logging).toEqual({ enabled: true, level: 'error' });
  });

  it('honours an explicit defaultDataset and normalizes datasets by name', () => {
    const options = resolveOptions({
      datasets: {
        a: { datasetId: '1', accessToken: 'token-a' },
        b: { datasetId: '2', accessToken: 'token-b', testEventCode: 'TEST123' },
      },
      defaultDataset: 'b',
    });

    expect(options.defaultDataset).toBe('b');
    expect(options.datasets.b).toEqual({
      name: 'b',
      datasetId: '2',
      accessToken: 'token-b',
      testEventCode: 'TEST123',
    });
  });

  it('throws when datasets is empty', () => {
    expect(() => resolveOptions({ datasets: {} })).toThrow(MetaCapiConfigurationError);
  });

  it('throws when a dataset is missing an accessToken', () => {
    expect(() =>
      resolveOptions({ datasets: { primary: { datasetId: '123', accessToken: '' } } }),
    ).toThrow('dataset "primary" is missing "accessToken"');
  });

  it('throws when a dataset is missing a datasetId', () => {
    expect(() =>
      resolveOptions({ datasets: { primary: { datasetId: '', accessToken: 'token' } } }),
    ).toThrow('dataset "primary" is missing "datasetId"');
  });

  it('throws when defaultDataset is not configured', () => {
    expect(() =>
      resolveOptions({
        datasets: { a: { datasetId: '1', accessToken: 'token' } },
        defaultDataset: 'missing',
      }),
    ).toThrow('"defaultDataset" ("missing") is not one of the configured datasets');
  });

  it('throws on an invalid dataset name', () => {
    expect(() =>
      resolveOptions({ datasets: { 'bad name': { datasetId: '1', accessToken: 'token' } } }),
    ).toThrow('dataset name "bad name" is invalid');
  });

  it('throws on an unsupported delivery mode', () => {
    expect(() =>
      resolveOptions({
        datasets: { a: { datasetId: '1', accessToken: 'token' } },
        delivery: { mode: 'fire-and-forget' as never },
      }),
    ).toThrow('unsupported delivery mode');
  });

  it('throws on invalid retry values', () => {
    const datasets = { a: { datasetId: '1', accessToken: 'token' } };

    expect(() => resolveOptions({ datasets, retry: { maxAttempts: 0 } })).toThrow(
      '"retry.maxAttempts" must be an integer >= 1',
    );
    expect(() => resolveOptions({ datasets, retry: { initialDelayMs: -1 } })).toThrow(
      '"retry.initialDelayMs" must be >= 0',
    );
    expect(() => resolveOptions({ datasets, retry: { maxDelayMs: -1 } })).toThrow(
      '"retry.maxDelayMs" must be >= 0',
    );
    expect(() =>
      resolveOptions({ datasets, retry: { initialDelayMs: 1000, maxDelayMs: 10 } }),
    ).toThrow('"retry.initialDelayMs" must not exceed "retry.maxDelayMs"');
  });

  it('throws on an unsupported logging level', () => {
    expect(() =>
      resolveOptions({
        datasets: { a: { datasetId: '1', accessToken: 'token' } },
        logging: { level: 'verbose' as never },
      }),
    ).toThrow('unsupported logging level');
  });

  it('defaults cookie write-back off and honours an explicit opt-in (ADR-8)', () => {
    const datasets = { a: { datasetId: '1', accessToken: 'token' } };

    expect(resolveOptions({ datasets }).cookies).toEqual({ enabled: false });
    expect(resolveOptions({ datasets, cookies: { enabled: true } }).cookies).toEqual({
      enabled: true,
    });
  });

  it('rejects a non-boolean cookies.enabled', () => {
    expect(() =>
      resolveOptions({
        datasets: { a: { datasetId: '1', accessToken: 'token' } },
        cookies: { enabled: 'yes' as never },
      }),
    ).toThrow('"cookies.enabled" must be a boolean');
  });

  it('never includes a token in a configuration error (SPEC.md §7, §9)', () => {
    const secret = 'super-secret-access-token-value';

    let caught: unknown;
    try {
      resolveOptions({ datasets: { 'bad name': { datasetId: '1', accessToken: secret } } });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MetaCapiConfigurationError);
    expect((caught as Error).message).not.toContain(secret);
  });
});
