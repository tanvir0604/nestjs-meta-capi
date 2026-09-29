import { jest } from '@jest/globals';

import type {
  MetaSendResult,
  MetaSdkAdapter,
  MetaSdkClientHandle,
} from '../src/clients/meta-sdk.adapter';
import { MetaCapiConfigurationError, MetaCapiValidationError } from '../src/errors/meta-capi.error';
import { MetaCapiService } from '../src/services/meta-capi.service';
import type { MetaEventPayload } from '../src/types/meta-event';
import type { MetaEventTransport } from '../src/transports/meta-event.transport';
import { RecordingLogger, resolve } from './helpers';

type SendMock = jest.Mock<(payload: MetaEventPayload) => Promise<void>>;

function flush(): Promise<void> {
  return new Promise((done) => setImmediate(done));
}

function createTransport(): { send: SendMock } {
  return { send: jest.fn<(payload: MetaEventPayload) => Promise<void>>() };
}

function createService(options = resolve(), transport: { send: SendMock } = createTransport()) {
  const logger = new RecordingLogger();
  const handle: MetaSdkClientHandle = {
    datasetName: 'main',
    datasetId: 'pixel-main',
    send: async (): Promise<MetaSendResult> => ({
      eventsReceived: 1,
      messages: [],
      fbtraceId: 't',
      id: 'i',
      numProcessedEntries: 1,
    }),
  };
  const adapter = {
    send: jest.fn(),
    createClientHandle: jest.fn(() => handle),
  } as unknown as MetaSdkAdapter;

  const service = new MetaCapiService(
    options,
    transport as unknown as MetaEventTransport,
    logger,
    adapter,
  );
  return { service, transport, logger, adapter };
}

describe('MetaCapiService.track', () => {
  it('rejects a payload without an event name', async () => {
    const { service, transport } = createService();

    await expect(service.track({ eventName: '  ' })).rejects.toBeInstanceOf(
      MetaCapiValidationError,
    );
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('in async mode resolves immediately and logs (never throws) a delivery failure (ADR-6)', async () => {
    const failure = new Error('delivery failed');
    const transport = createTransport();
    transport.send.mockRejectedValue(failure);
    const { service, logger } = createService(resolve(), transport);

    const payload: MetaEventPayload = { eventName: 'Lead' };
    await expect(service.track(payload)).resolves.toBeUndefined();
    await flush();

    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.send.mock.calls[0]?.[0]).toBe(payload);
    expect(logger.records.some((record) => record.level === 'error')).toBe(true);
  });

  it('in sync mode awaits the send and surfaces a failure to the caller', async () => {
    const failure = new Error('delivery failed');
    const transport = createTransport();
    transport.send.mockRejectedValue(failure);
    const { service } = createService(resolve({ delivery: { mode: 'sync' } }), transport);

    await expect(service.track({ eventName: 'Lead' })).rejects.toBe(failure);
  });

  it('in sync mode resolves when the send succeeds', async () => {
    const transport = createTransport();
    transport.send.mockResolvedValue(undefined);
    const { service } = createService(resolve({ delivery: { mode: 'sync' } }), transport);

    await expect(service.track({ eventName: 'Lead' })).resolves.toBeUndefined();
  });
});

describe('MetaCapiService.getClient (§5.4)', () => {
  it('returns a handle bound to the requested dataset', () => {
    const { service } = createService();

    const handle = service.getClient('main');

    expect(handle.datasetName).toBe('main');
    expect(handle.datasetId).toBe('pixel-main');
  });

  it('throws for an unknown dataset', () => {
    const { service } = createService();

    expect(() => service.getClient('nope')).toThrow(MetaCapiConfigurationError);
  });

  it('defaults to the configured default dataset', () => {
    const { service } = createService();

    expect(service.getClient().datasetName).toBe('main');
  });
});
