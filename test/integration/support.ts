import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import type {
  MetaNormalizedEvent,
  MetaSdkAdapter,
  MetaSendResult,
} from '../../src/clients/meta-sdk.adapter';
import type { MetaCapiModuleOptions } from '../../src/config/meta-capi.options';
import { MetaDataset } from '../../src/decorators/meta-dataset.decorator';
import { MetaEvent } from '../../src/decorators/meta-event.decorator';

export const SUCCESS: MetaSendResult = {
  eventsReceived: 1,
  messages: [],
  fbtraceId: 'trace-1',
  id: 'id-1',
  numProcessedEntries: 1,
};

export interface RecordingAdapter {
  sends: MetaNormalizedEvent[];
  adapter: MetaSdkAdapter;
}

/** A fake adapter so the integration tests never touch the network. */
export function createRecordingAdapter(): RecordingAdapter {
  const sends: MetaNormalizedEvent[] = [];
  const adapter: MetaSdkAdapter = {
    async send(event: MetaNormalizedEvent): Promise<MetaSendResult> {
      sends.push(event);
      return SUCCESS;
    },
    createClientHandle: (dataset) => ({
      datasetName: dataset.name,
      datasetId: dataset.datasetId,
      send: async () => SUCCESS,
    }),
  };
  return { sends, adapter };
}

export interface CreateLeadBody {
  id: string;
  email?: string;
}

@Controller('leads')
@MetaDataset('main')
export class LeadController {
  @Post()
  @HttpCode(201)
  @MetaEvent<CreateLeadBody>({
    name: 'Lead',
    eventId: (result) => result.id,
    user: (result) => (result.email === undefined ? undefined : { email: result.email }),
  })
  async create(@Body() body: CreateLeadBody): Promise<CreateLeadBody> {
    return body;
  }

  @Post('boom')
  @MetaEvent<CreateLeadBody>({ name: 'Lead' })
  async boom(): Promise<never> {
    throw new Error('business failure');
  }
}

export const moduleOptions: MetaCapiModuleOptions = {
  datasets: { main: { datasetId: 'pixel-main', accessToken: 'token-main' } },
  delivery: { mode: 'sync' },
  cookies: { enabled: true },
};
