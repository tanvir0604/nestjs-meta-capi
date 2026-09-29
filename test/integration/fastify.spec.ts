import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { META_CAPI_ADAPTER } from '../../src/config/meta-capi.tokens';
import { MetaCapiModule } from '../../src/meta-capi.module';
import { createRecordingAdapter, LeadController, moduleOptions } from './support';

describe('Fastify integration (SPEC.md §12)', () => {
  const recorded = createRecordingAdapter();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetaCapiModule.forRoot(moduleOptions)],
      controllers: [LeadController],
    })
      .overrideProvider(META_CAPI_ADAPTER)
      .useValue(recorded.adapter)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    recorded.sends.length = 0;
  });

  it('emits the event after a successful handler and returns the result untouched', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/leads',
      headers: { host: 'example.com', 'user-agent': 'fastify-agent' },
      payload: { id: 'lead-1', email: 'joe@example.com' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: 'lead-1', email: 'joe@example.com' });

    expect(recorded.sends).toHaveLength(1);
    expect(recorded.sends[0]).toMatchObject({
      eventName: 'Lead',
      eventId: 'lead-1',
      actionSource: 'website',
    });
    expect(recorded.sends[0]?.userData).toMatchObject({
      email: 'joe@example.com',
      client_user_agent: 'fastify-agent',
    });

    // ADR-8: _fbp is written back as a first-party cookie.
    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('_fbp=');
  });

  it('does not emit when the handler throws, and the failure still reaches the client', async () => {
    const response = await app.inject({ method: 'POST', url: '/leads/boom', payload: {} });

    expect(response.statusCode).toBe(500);
    expect(recorded.sends).toHaveLength(0);
  });
});
