import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ParamBuilder } from 'capi-param-builder-nodejs';

import { BusinessSdkAdapter } from './clients/business-sdk.adapter';
import { createFetchExecutor } from './clients/fetch.executor';
import { HttpServiceTransport } from './clients/http-service.transport';
import type { MetaSdkAdapter } from './clients/meta-sdk.adapter';
import { META_CAPI_LOGGER } from './config/meta-capi.tokens';
import {
  META_CAPI_ADAPTER,
  META_CAPI_OPTIONS,
  META_CAPI_PARAM_BUILDER_FACTORY,
  META_CAPI_TRANSPORT,
} from './config/meta-capi.tokens';
import type {
  MetaCapiModuleAsyncOptions,
  MetaCapiModuleOptions,
  ResolvedMetaCapiOptions,
} from './config/meta-capi.options';
import { resolveOptions } from './config/validate-options';
import { MetaEventInterceptor } from './interceptors/meta-event.interceptor';
import { StructuredLogger, type MetaCapiLogger } from './logging/meta-capi.logger';
import { MetaCapiService } from './services/meta-capi.service';
import { ImmediateTransport } from './transports/immediate.transport';

function createCoreProviders(): Provider[] {
  return [
    {
      provide: META_CAPI_LOGGER,
      useFactory: (options: ResolvedMetaCapiOptions): MetaCapiLogger =>
        new StructuredLogger(options.logging),
      inject: [META_CAPI_OPTIONS],
    },
    {
      provide: META_CAPI_ADAPTER,
      useFactory: (logger: MetaCapiLogger): MetaSdkAdapter =>
        new BusinessSdkAdapter(new HttpServiceTransport(createFetchExecutor()), logger),
      inject: [META_CAPI_LOGGER],
    },
    {
      provide: META_CAPI_PARAM_BUILDER_FACTORY,
      useValue: () => new ParamBuilder(),
    },
    {
      provide: META_CAPI_TRANSPORT,
      useClass: ImmediateTransport,
    },
    MetaCapiService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetaEventInterceptor,
    },
  ];
}

/**
 * The public module (SPEC.md §5.1). Registers the metadata-gated interceptor
 * globally via `APP_INTERCEPTOR`, so the package "just works" after `forRoot()`.
 *
 * The package never reads `process.env` for config values — apps supply them
 * through NestJS config, ideally with `forRootAsync`.
 */
@Module({})
export class MetaCapiModule {
  static forRoot(options: MetaCapiModuleOptions): DynamicModule {
    const resolved = resolveOptions(options);
    return {
      module: MetaCapiModule,
      global: true,
      providers: [{ provide: META_CAPI_OPTIONS, useValue: resolved }, ...createCoreProviders()],
      exports: [MetaCapiService],
    };
  }

  static forRootAsync(options: MetaCapiModuleAsyncOptions): DynamicModule {
    return {
      module: MetaCapiModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: META_CAPI_OPTIONS,
          useFactory: async (...args: unknown[]): Promise<ResolvedMetaCapiOptions> =>
            resolveOptions(await options.useFactory(...args)),
          inject: options.inject ?? [],
        },
        ...(options.providers ?? []),
        ...createCoreProviders(),
      ],
      exports: [MetaCapiService],
    };
  }
}
