import type { INestApplication } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { META_CAPI_ADAPTER } from '../../src/config/meta-capi.tokens';
import { MetaCapiModule } from '../../src/meta-capi.module';
import { createRecordingAdapter, LeadController, moduleOptions } from './support';

describe('Express integration (SPEC.md §12)', () => {
  const recorded = createRecordingAdapter();
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetaCapiModule.forRoot(moduleOptions)],
      controllers: [LeadController],
    })
      .overrideProvider(META_CAPI_ADAPTER)
      .useValue(recorded.adapter)
      .compile();

    app = moduleRef.createNestApplication(new ExpressAdapter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    recorded.sends.length = 0;
  });

  it('emits the event after a successful handler and returns the result untouched', async () => {
    const response = await request(app.getHttpServer())
      .post('/leads')
      .set('host', 'example.com')
      .set('user-agent', 'express-agent')
      .send({ id: 'lead-1', email: 'joe@example.com' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 'lead-1', email: 'joe@example.com' });

    expect(recorded.sends).toHaveLength(1);
    expect(recorded.sends[0]).toMatchObject({
      eventName: 'Lead',
      eventId: 'lead-1',
      actionSource: 'website',
    });
    expect(recorded.sends[0]?.userData).toMatchObject({
      email: 'joe@example.com',
      client_user_agent: 'express-agent',
    });

    // ADR-8: _fbp is written back as a first-party cookie.
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie.some((value) => value.startsWith('_fbp='))).toBe(true);
  });

  it('does not emit when the handler throws, and the failure still reaches the client', async () => {
    const response = await request(app.getHttpServer()).post('/leads/boom').send({});

    expect(response.status).toBe(500);
    expect(recorded.sends).toHaveLength(0);
  });
});
