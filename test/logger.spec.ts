import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { redactMeta, StructuredLogger } from '../src/logging/meta-capi.logger';

describe('redactMeta (SPEC.md §9)', () => {
  it('redacts secrets and raw PII by key', () => {
    expect(
      redactMeta({
        accessToken: 'abc',
        email: 'joe@example.com',
        phone: '123456',
        cookie: 'x',
        authorization: 'Bearer x',
        password: 'p',
      }),
    ).toEqual({
      accessToken: '[REDACTED]',
      email: '[REDACTED]',
      phone: '[REDACTED]',
      cookie: '[REDACTED]',
      authorization: '[REDACTED]',
      password: '[REDACTED]',
    });
  });

  it('keeps safe fields and recurses into nested objects', () => {
    expect(
      redactMeta({
        eventName: 'Lead',
        dataset: 'main',
        nested: { accessToken: 'abc', fbtraceId: 't-1' },
      }),
    ).toEqual({
      eventName: 'Lead',
      dataset: 'main',
      nested: { accessToken: '[REDACTED]', fbtraceId: 't-1' },
    });
  });

  it('redacts secrets inside arrays', () => {
    expect(redactMeta({ items: [{ accessToken: 'abc' }, 'plain'] })).toEqual({
      items: [{ accessToken: '[REDACTED]' }, 'plain'],
    });
  });
});

describe('StructuredLogger', () => {
  it('emits nothing when disabled', () => {
    const spy = jest.spyOn(Logger.prototype, 'error');
    const logger = new StructuredLogger({ enabled: false, level: 'debug' });

    logger.error('nope');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('gates below the configured level', () => {
    const debugSpy = jest.spyOn(Logger.prototype, 'debug');
    const errorSpy = jest.spyOn(Logger.prototype, 'error');
    const logger = new StructuredLogger({ enabled: true, level: 'error' });

    logger.debug('skipped');
    logger.error('kept');

    expect(debugSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    debugSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('redacts before it reaches the log sink', () => {
    const spy = jest.spyOn(Logger.prototype, 'error');
    const logger = new StructuredLogger({ enabled: true, level: 'debug' });

    logger.error('delivery failed', { dataset: 'main', accessToken: 'secret-token' });

    const message = spy.mock.calls[0]?.[0] as string;
    expect(message).toContain('main');
    expect(message).not.toContain('secret-token');
    spy.mockRestore();
  });

  it('emits the bare message when there is no metadata', () => {
    const spy = jest.spyOn(Logger.prototype, 'warn');
    const logger = new StructuredLogger({ enabled: true, level: 'debug' });

    logger.warn('plain message');

    expect(spy).toHaveBeenCalledWith('plain message');
    spy.mockRestore();
  });

  it('does not throw when the metadata cannot be serialized', () => {
    const spy = jest.spyOn(Logger.prototype, 'log');
    const logger = new StructuredLogger({ enabled: true, level: 'debug' });

    expect(() => logger.log('with bigint', { n: 1n })).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
