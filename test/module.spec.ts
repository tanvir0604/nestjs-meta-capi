import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import type { MetaSendResult } from '../src/clients/meta-sdk.adapter';
import { META_CAPI_ADAPTER } from '../src/config/meta-capi.tokens';
import { MetaCapiModule } from '../src/meta-capi.module';
import { MetaCapiService } from '../src/services/meta-capi.service';
import type { MetaNormalizedEvent } from '../src/clients/meta-sdk.adapter';

const SUCCESS: MetaSendResult = {
  eventsReceived: 1,
  messages: [],
  fbtraceId: 't',
  id: 'i',
  numProcessedEntries: 1,
};

function flush(): Promise<void> {
  return new Promise((done) => setImmediate(done));
}

function createFakeAdapter() {
  const sends: MetaNormalizedEvent[] = [];
  return {
    sends,
    adapter: {
      send: jest.fn(async (event: MetaNormalizedEvent) => {
        sends.push(event);
        return SUCCESS;
      }),
      createClientHandle: jest.fn((dataset: { name: string; datasetId: string }) => ({
        datasetName: dataset.name,
        datasetId: dataset.datasetId,
        send: async () => SUCCESS,
      })),
    },
  };
}

describe('MetaCapiModule', () => {
  it('forRoot wires up a working service end-to-end (through the real transport)', async () => {
    const { sends, adapter } = createFakeAdapter();

    const moduleRef = await Test.createTestingModule({
      imports: [
        MetaCapiModule.forRoot({
          datasets: { main: { datasetId: 'pixel-main', accessToken: 'token-main' } },
        }),
      ],
    })
      .overrideProvider(META_CAPI_ADAPTER)
      .useValue(adapter)
      .compile();

    const service = moduleRef.get(MetaCapiService);
    await service.track({ eventName: 'Lead', userData: { email: 'joe@example.com' } });
    await flush();

    expect(sends).toHaveLength(1);
    expect(sends[0]?.eventName).toBe('Lead');
    expect(sends[0]?.actionSource).toBe('website');
    expect(sends[0]?.userData.email).toBe('joe@example.com');
  });

  it('forRootAsync resolves options from a factory', async () => {
    const { adapter, sends } = createFakeAdapter();

    const moduleRef = await Test.createTestingModule({
      imports: [
        MetaCapiModule.forRootAsync({
          useFactory: () => ({
            datasets: { 'async-main': { datasetId: 'pixel-async', accessToken: 'token-async' } },
          }),
        }),
      ],
    })
      .overrideProvider(META_CAPI_ADAPTER)
      .useValue(adapter)
      .compile();

    const service = moduleRef.get(MetaCapiService);
    await service.track({ eventName: 'Lead' });
    await flush();

    expect(sends).toHaveLength(1);
    expect(service.getClient().datasetName).toBe('async-main');
  });

  it('exposes the configured client handle', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MetaCapiModule.forRoot({
          datasets: {
            a: { datasetId: 'pixel-a', accessToken: 'token-a' },
            b: { datasetId: 'pixel-b', accessToken: 'token-b' },
          },
          defaultDataset: 'b',
        }),
      ],
    }).compile();

    const service = moduleRef.get(MetaCapiService);
    expect(service.getClient().datasetName).toBe('b');
    expect(service.getClient('a').datasetId).toBe('pixel-a');
  });
});
