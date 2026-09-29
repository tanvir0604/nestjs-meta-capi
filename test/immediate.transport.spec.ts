import { jest } from '@jest/globals';
import { ParamBuilder } from 'capi-param-builder-nodejs';

import type {
  MetaSdkAdapter,
  MetaNormalizedEvent,
  MetaSendResult,
} from '../src/clients/meta-sdk.adapter';
import type { ResolvedDataset } from '../src/config/meta-capi.options';
import {
  MetaCapiConfigurationError,
  MetaCapiDeliveryError,
  MetaCapiRetryExhaustedError,
} from '../src/errors/meta-capi.error';
import { ImmediateTransport } from '../src/transports/immediate.transport';
import { RecordingLogger, resolve } from './helpers';

const SUCCESS: MetaSendResult = {
  eventsReceived: 1,
  messages: [],
  fbtraceId: 'trace-1',
  id: 'id-1',
  numProcessedEntries: 1,
};

interface SendCall {
  event: MetaNormalizedEvent;
  dataset: ResolvedDataset;
}

function createAdapter(results: Array<MetaSendResult | Error>): {
  adapter: MetaSdkAdapter;
  calls: SendCall[];
} {
  const calls: SendCall[] = [];
  const adapter: MetaSdkAdapter = {
    send: jest.fn(async (event: MetaNormalizedEvent, dataset: ResolvedDataset) => {
      calls.push({ event, dataset });
      const next = results[Math.min(calls.length - 1, results.length - 1)];
      if (next instanceof Error) {
        throw next;
      }
      return next ?? SUCCESS;
    }),
    createClientHandle: jest.fn(),
  } as unknown as MetaSdkAdapter;
  return { adapter, calls };
}

function createTransport(options = resolve(), results: Array<MetaSendResult | Error> = [SUCCESS]) {
  const { adapter, calls } = createAdapter(results);
  const logger = new RecordingLogger();
  const transport = new ImmediateTransport(options, adapter, logger, () => new ParamBuilder());
  return { transport, calls, logger };
}

const retryDisabled = { retry: { enabled: false } };
const retryInstant = { retry: { enabled: true, maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0 } };

describe('ImmediateTransport.send', () => {
  it('delivers a normalized event with defaults applied', async () => {
    const { transport, calls } = createTransport();

    await transport.send({ eventName: 'Lead', userData: { email: 'joe@example.com' } });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.event.eventName).toBe('Lead');
    expect(calls[0]?.event.actionSource).toBe('website');
    expect(calls[0]?.event.userData).toEqual({ email: 'joe@example.com' });
    expect(calls[0]?.dataset.datasetId).toBe('pixel-main');
  });

  it('fills request context (user agent) from the request', async () => {
    const { transport, calls } = createTransport();

    await transport.send({
      eventName: 'Lead',
      request: { headers: { 'user-agent': 'jest-agent' } },
    });

    expect(calls[0]?.event.userData.client_user_agent).toBe('jest-agent');
  });

  it('throws a configuration error for an unknown dataset', async () => {
    const { transport, calls } = createTransport();

    await expect(transport.send({ eventName: 'Lead', dataset: 'missing' })).rejects.toBeInstanceOf(
      MetaCapiConfigurationError,
    );
    expect(calls).toHaveLength(0);
  });

  it('treats a body-level failure as a delivery error and does not retry it', async () => {
    const zero: MetaSendResult = { ...SUCCESS, eventsReceived: 0 };
    const { transport, calls } = createTransport(resolve(retryInstant), [zero]);

    await expect(transport.send({ eventName: 'Lead' })).rejects.toBeInstanceOf(
      MetaCapiDeliveryError,
    );
    expect(calls).toHaveLength(1);
  });

  it('retries a 5xx and succeeds on a later attempt (§10.2)', async () => {
    const { transport, calls } = createTransport(resolve(retryInstant), [
      new MetaCapiDeliveryError('server', { status: 500 }),
      SUCCESS,
    ]);

    await expect(transport.send({ eventName: 'Lead' })).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
  });

  it('throws MetaCapiRetryExhaustedError after all attempts fail, preserving the cause (§8)', async () => {
    const failure = new MetaCapiDeliveryError('server', { status: 503 });
    const { transport, calls } = createTransport(resolve(retryInstant), [
      failure,
      failure,
      failure,
    ]);

    let caught: unknown;
    try {
      await transport.send({ eventName: 'Lead' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MetaCapiRetryExhaustedError);
    expect((caught as MetaCapiRetryExhaustedError).cause).toBe(failure);
    expect((caught as MetaCapiRetryExhaustedError).context).toMatchObject({
      attempts: 3,
      status: 503,
    });
    expect(calls).toHaveLength(3);
  });

  it('does not retry a 4xx (auth/validation) — fails identically', async () => {
    const failure = new MetaCapiDeliveryError('nope', { status: 401 });
    const { transport, calls } = createTransport(resolve(retryInstant), [failure]);

    await expect(transport.send({ eventName: 'Lead' })).rejects.toBeInstanceOf(
      MetaCapiDeliveryError,
    );
    expect(calls).toHaveLength(1);
  });

  it('makes a single attempt when retries are disabled', async () => {
    const failure = new MetaCapiDeliveryError('server', { status: 500 });
    const { transport, calls } = createTransport(resolve(retryDisabled), [failure]);

    await expect(transport.send({ eventName: 'Lead' })).rejects.toBe(failure);
    expect(calls).toHaveLength(1);
  });

  it('uses the per-event testEventCode, falling back to the dataset default (ADR-9)', async () => {
    const options = resolve({
      datasets: {
        main: { datasetId: 'pixel-main', accessToken: 'token-main', testEventCode: 'DATASET-CODE' },
      },
    });
    const { transport, calls } = createTransport(options);

    await transport.send({ eventName: 'Lead' });
    expect(calls[0]?.dataset.testEventCode).toBe('DATASET-CODE');

    await transport.send({ eventName: 'Lead', testEventCode: 'EVENT-CODE' });
    expect(calls[1]?.dataset.testEventCode).toBe('EVENT-CODE');
  });

  it('waits between attempts when a backoff delay is configured', async () => {
    const { transport, calls } = createTransport(
      resolve({ retry: { enabled: true, maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 1 } }),
      [new MetaCapiDeliveryError('server', { status: 500 }), SUCCESS],
    );

    await expect(transport.send({ eventName: 'Lead', eventId: 'e1' })).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
  });

  it('wraps a non-Meta error as a delivery error once attempts are exhausted', async () => {
    const { transport } = createTransport(resolve(retryInstant), [
      new Error('socket hang up'),
      new Error('socket hang up'),
      new Error('socket hang up'),
    ]);

    let caught: unknown;
    try {
      await transport.send({ eventName: 'Lead' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MetaCapiDeliveryError);
    expect(caught).not.toBeInstanceOf(MetaCapiRetryExhaustedError);
  });
});
