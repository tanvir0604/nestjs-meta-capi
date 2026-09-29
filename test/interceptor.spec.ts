import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ParamBuilder } from 'capi-param-builder-nodejs';
import { lastValueFrom, of, throwError } from 'rxjs';

import { MetaDataset } from '../src/decorators/meta-dataset.decorator';
import { MetaEvent } from '../src/decorators/meta-event.decorator';
import type { ResolvedMetaCapiOptions } from '../src/config/meta-capi.options';
import { MetaEventInterceptor } from '../src/interceptors/meta-event.interceptor';
import type { MetaCapiService } from '../src/services/meta-capi.service';
import type { MetaEventOptions, MetaEventPayload } from '../src/types/meta-event';
import type { MetaRequestLike } from '../src/types/meta-request';
import { RecordingLogger, resolve } from './helpers';

class FakeService {
  readonly payloads: MetaEventPayload[] = [];

  async track(payload: MetaEventPayload): Promise<void> {
    this.payloads.push(payload);
  }
}

function decorate(controller: object, key: string, options: MetaEventOptions): void {
  const descriptor = Object.getOwnPropertyDescriptor(controller, key);
  if (descriptor === undefined) {
    throw new Error(`No method "${key}"`);
  }
  MetaEvent(options)(controller, key, descriptor);
}

function decorateDataset(controller: object, key: string, name: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(controller, key);
  if (descriptor === undefined) {
    throw new Error(`No method "${key}"`);
  }
  MetaDataset(name)(controller, key, descriptor);
}

interface FakeResponse {
  statusCode: number;
  setCookies: string[];
  append(name: string, value: string): void;
}

function createResponse(status: number): FakeResponse {
  const setCookies: string[] = [];
  return {
    statusCode: status,
    setCookies,
    append(name: string, value: string): void {
      if (name.toLowerCase() === 'set-cookie') {
        setCookies.push(value);
      }
    },
  };
}

interface ContextOptions {
  handler: (...args: never[]) => unknown;
  controller: object;
  request?: MetaRequestLike;
  status?: number;
  type?: string;
  response?: FakeResponse;
}

function createContext(options: ContextOptions): ExecutionContext {
  const response = options.response ?? createResponse(options.status ?? 200);
  return {
    getType: () => options.type ?? 'http',
    getHandler: () => options.handler,
    getClass: () => options.controller,
    switchToHttp: () => ({
      getRequest: () => options.request ?? {},
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function createInterceptor(
  service: FakeService,
  options: ResolvedMetaCapiOptions = resolve(),
): MetaEventInterceptor {
  return new MetaEventInterceptor(
    options,
    new RecordingLogger(),
    new Reflector(),
    service as unknown as MetaCapiService,
    () => new ParamBuilder(),
  );
}

describe('MetaEventInterceptor', () => {
  it('dispatches after a successful handler and returns the result unchanged', async () => {
    class LeadController {
      async createLead(): Promise<{ id: string }> {
        return { id: 'lead-1' };
      }
    }
    decorate(LeadController.prototype, 'createLead', { name: 'Lead', eventId: 'id' });

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    const context = createContext({
      handler: LeadController.prototype.createLead,
      controller: LeadController,
      request: { headers: { 'user-agent': 'jest' } },
    });
    const next: CallHandler = { handle: () => of({ id: 'lead-1' }) };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ id: 'lead-1' });
    expect(service.payloads).toHaveLength(1);
    expect(service.payloads[0]?.eventName).toBe('Lead');
    expect(service.payloads[0]?.eventId).toBe('lead-1');
  });

  it('does not dispatch when the handler throws, and preserves the exception (invariant 3)', async () => {
    class LeadController {
      async createLead(): Promise<void> {
        throw new Error('boom');
      }
    }
    decorate(LeadController.prototype, 'createLead', { name: 'Lead' });

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    const context = createContext({
      handler: LeadController.prototype.createLead,
      controller: LeadController,
    });
    const original = new Error('boom');
    const next: CallHandler = { handle: () => throwError(() => original) };

    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toBe(original);
    expect(service.payloads).toHaveLength(0);
  });

  it('does not dispatch for a non-2xx response that returned normally (ADR-7)', async () => {
    class LeadController {
      async createLead(): Promise<void> {
        /* no-op */
      }
    }
    decorate(LeadController.prototype, 'createLead', { name: 'Lead' });

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    const context = createContext({
      handler: LeadController.prototype.createLead,
      controller: LeadController,
      status: 500,
    });
    const next: CallHandler = { handle: () => of(undefined) };

    await lastValueFrom(interceptor.intercept(context, next));

    expect(service.payloads).toHaveLength(0);
  });

  it('passes through untouched when the route has no @MetaEvent metadata (ADR-4)', async () => {
    class PlainController {
      async get(): Promise<string> {
        return 'ok';
      }
    }

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    const context = createContext({
      handler: PlainController.prototype.get,
      controller: PlainController,
    });
    const next: CallHandler = { handle: () => of('ok') };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe('ok');
    expect(service.payloads).toHaveLength(0);
  });

  it('passes through for a non-http execution context', async () => {
    const service = new FakeService();
    const interceptor = createInterceptor(service);
    const context = createContext({
      handler: () => undefined,
      controller: class {},
      type: 'rpc',
    });
    const next: CallHandler = { handle: () => of('ok') };

    await lastValueFrom(interceptor.intercept(context, next));

    expect(service.payloads).toHaveLength(0);
  });

  it('resolves the dataset: @MetaEvent > method > controller (SPEC.md §4.3)', async () => {
    class Controller {
      async handler(): Promise<void> {
        /* no-op */
      }
    }
    MetaDataset('from-controller')(Controller);
    decorateDataset(Controller.prototype, 'handler', 'from-method');
    decorate(Controller.prototype, 'handler', { name: 'Lead' });

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    await lastValueFrom(
      interceptor.intercept(
        createContext({ handler: Controller.prototype.handler, controller: Controller }),
        { handle: () => of(undefined) },
      ),
    );
    expect(service.payloads[0]?.dataset).toBe('from-method');

    decorate(Controller.prototype, 'handler', { name: 'Lead', dataset: 'from-event' });
    await lastValueFrom(
      interceptor.intercept(
        createContext({ handler: Controller.prototype.handler, controller: Controller }),
        { handle: () => of(undefined) },
      ),
    );
    expect(service.payloads[1]?.dataset).toBe('from-event');
  });

  it('falls back to the controller-level dataset when the method has none', async () => {
    class Controller {
      async handler(): Promise<void> {
        /* no-op */
      }
    }
    MetaDataset('from-controller')(Controller);
    decorate(Controller.prototype, 'handler', { name: 'Lead' });

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    await lastValueFrom(
      interceptor.intercept(
        createContext({ handler: Controller.prototype.handler, controller: Controller }),
        { handle: () => of(undefined) },
      ),
    );

    expect(service.payloads[0]?.dataset).toBe('from-controller');
  });

  it('resolves eventId from a mapper and builds user/custom data via mappers', async () => {
    class LeadController {
      async createLead(): Promise<{ id: string; email: string; amount: number }> {
        return { id: 'l1', email: 'joe@example.com', amount: 500 };
      }
    }
    decorate(LeadController.prototype, 'createLead', {
      name: 'Lead',
      eventId: (result) => (result as { id: string }).id,
      user: (result) => ({ email: (result as { email: string }).email }),
      customData: (result) => ({ value: (result as { amount: number }).amount, currency: 'USD' }),
    });

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    await lastValueFrom(
      interceptor.intercept(
        createContext({
          handler: LeadController.prototype.createLead,
          controller: LeadController,
        }),
        { handle: () => of({ id: 'l1', email: 'joe@example.com', amount: 500 }) },
      ),
    );

    expect(service.payloads[0]?.eventId).toBe('l1');
    expect(service.payloads[0]?.userData).toEqual({ email: 'joe@example.com' });
    expect(service.payloads[0]?.customData).toEqual({ value: 500, currency: 'USD' });
  });

  it('omits user/custom data when the mappers return undefined', async () => {
    class LeadController {
      async createLead(): Promise<{ id: string }> {
        return { id: 'l1' };
      }
    }
    decorate(LeadController.prototype, 'createLead', {
      name: 'Lead',
      user: () => undefined,
      customData: () => undefined,
    });

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    await lastValueFrom(
      interceptor.intercept(
        createContext({
          handler: LeadController.prototype.createLead,
          controller: LeadController,
        }),
        { handle: () => of({ id: 'l1' }) },
      ),
    );

    expect(service.payloads[0]?.userData).toBeUndefined();
    expect(service.payloads[0]?.customData).toBeUndefined();
    expect(service.payloads[0]?.dataset).toBeUndefined();
    expect(service.payloads[0]?.eventId).toBeUndefined();
  });

  it('ignores an eventId property path that does not resolve', async () => {
    class LeadController {
      async createLead(): Promise<{ id: string }> {
        return { id: 'l1' };
      }
    }
    decorate(LeadController.prototype, 'createLead', { name: 'Lead', eventId: 'nested.missing' });

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    await lastValueFrom(
      interceptor.intercept(
        createContext({
          handler: LeadController.prototype.createLead,
          controller: LeadController,
        }),
        { handle: () => of({ id: 'l1' }) },
      ),
    );

    expect(service.payloads[0]?.eventId).toBeUndefined();
  });

  it('supports an eventTime mapper', async () => {
    class LeadController {
      async createLead(): Promise<void> {
        /* no-op */
      }
    }
    decorate(LeadController.prototype, 'createLead', {
      name: 'Lead',
      eventTime: () => new Date('2024-01-01T00:00:00.000Z'),
    });

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    await lastValueFrom(
      interceptor.intercept(
        createContext({
          handler: LeadController.prototype.createLead,
          controller: LeadController,
        }),
        { handle: () => of(undefined) },
      ),
    );

    expect(service.payloads[0]?.eventTime).toEqual(new Date('2024-01-01T00:00:00.000Z'));
  });

  it('writes _fbc/_fbp back as first-party cookies when enabled (ADR-8)', async () => {
    class LeadController {
      async createLead(): Promise<void> {
        /* no-op */
      }
    }
    decorate(LeadController.prototype, 'createLead', { name: 'Lead' });

    const service = new FakeService();
    const interceptor = createInterceptor(service, resolve({ cookies: { enabled: true } }));
    const response = createResponse(200);

    await lastValueFrom(
      interceptor.intercept(
        createContext({
          handler: LeadController.prototype.createLead,
          controller: LeadController,
          response,
          request: { headers: { host: 'example.com' }, protocol: 'https', originalUrl: '/lead' },
        }),
        { handle: () => of(undefined) },
      ),
    );

    expect(response.setCookies.some((cookie) => cookie.startsWith('_fbp='))).toBe(true);
    expect(response.setCookies[0]).toContain('Path=/');
    expect(response.setCookies[0]).toContain('Max-Age=');
  });

  it('does not write cookies by default', async () => {
    class LeadController {
      async createLead(): Promise<void> {
        /* no-op */
      }
    }
    decorate(LeadController.prototype, 'createLead', { name: 'Lead' });

    const service = new FakeService();
    const interceptor = createInterceptor(service);
    const response = createResponse(200);

    await lastValueFrom(
      interceptor.intercept(
        createContext({
          handler: LeadController.prototype.createLead,
          controller: LeadController,
          response,
          request: { headers: { host: 'example.com' }, protocol: 'https', originalUrl: '/lead' },
        }),
        { handle: () => of(undefined) },
      ),
    );

    expect(response.setCookies).toHaveLength(0);
  });

  it('skips the write-back when the response is not writeable', async () => {
    class LeadController {
      async createLead(): Promise<void> {
        /* no-op */
      }
    }
    decorate(LeadController.prototype, 'createLead', { name: 'Lead' });

    const service = new FakeService();
    const interceptor = createInterceptor(service, resolve({ cookies: { enabled: true } }));

    // No `append`/`header`/`setHeader` on the response.
    const inertResponse = { statusCode: 200 } as unknown as FakeResponse;

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createContext({
            handler: LeadController.prototype.createLead,
            controller: LeadController,
            response: inertResponse,
            request: { headers: { host: 'example.com' } },
          }),
          { handle: () => of(undefined) },
        ),
      ),
    ).resolves.toBeUndefined();
  });
});
