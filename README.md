# nestjs-meta-capi

Idiomatic NestJS integration for the [Meta Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api/),
powered by Meta's official Node.js Business SDK.

Send conversion events from a NestJS application with a decorator, dependency injection, and strict
types — without hand-building `ServerEvent` / `UserData` / `EventRequest` objects, and without
touching the SDK's process-global singleton.

> **Disclaimer.** This package is an independent, community-maintained NestJS integration. It is
> **not** an official Meta or Facebook product and is not endorsed by or affiliated with Meta
> Platforms, Inc. It is powered by Meta's official Node.js Business SDK. "Meta", "Facebook", and
> "Conversions API" are trademarks of Meta Platforms, Inc.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Decorators](#decorators)
- [Programmatic use](#programmatic-use)
- [Delivery and retries](#delivery-and-retries)
- [Request context and PII](#request-context-and-pii)
- [Cookie write-back](#cookie-write-back)
- [Escape hatch](#escape-hatch)
- [Compatibility](#compatibility)
- [Testing](#testing)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Declarative.** A single `@MetaEvent()` decorator describes the event; the package handles
  mapping, dataset resolution, and delivery.
- **Correct by default.** Events fire only after a handler resolves with a **2xx** response, and
  never when it throws — the original result and exception are passed through untouched.
- **Multi-dataset.** Configure any number of pixels/tokens and resolve per method, per controller,
  or per call, with a configured default.
- **Non-blocking.** `async` delivery (the default) keeps Meta latency off the request path; a
  delivery failure never fails the business request.
- **Resilient.** Exponential backoff with jitter, retries limited to recoverable failures, and
  **body-aware** success detection (a `200` is not treated as proof of success).
- **Accurate.** Automatic request-context enrichment (`fbc`, `fbp`, client IP, event source URL,
  client user agent) for stronger Event Match Quality.
- **Private.** Raw PII is passed through unhashed for the SDK to normalize, tokens and PII are
  redacted at the logger boundary, and tokens never appear in error messages.
- **Typed.** Written in strict TypeScript; the Meta SDK never appears in the public type surface.
- **Framework-agnostic.** Verified against both Express and Fastify.

## Requirements

- Node.js `>= 20`
- NestJS `^11` or `^12` (`@nestjs/common`, `@nestjs/core`)
- `reflect-metadata` and `rxjs` (NestJS peer dependencies)

## Installation

```bash
npm install nestjs-meta-capi
```

`@nestjs/common`, `@nestjs/core`, `reflect-metadata`, and `rxjs` are peer dependencies and are
already present in a NestJS application. `facebook-nodejs-business-sdk` and
`capi-param-builder-nodejs` are installed automatically; both are published by Meta under Meta's
**Platform License**. This package itself is MIT — see [LICENSE](./LICENSE).

## Quick start

Register the module once, in your root module. `forRootAsync` is the recommended production form so
credentials come from configuration rather than literals.

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MetaCapiModule } from 'nestjs-meta-capi';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MetaCapiModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        datasets: {
          primary: {
            datasetId: config.getOrThrow('META_DATASET_ID'),
            accessToken: config.getOrThrow('META_ACCESS_TOKEN'),
          },
        },
        defaultDataset: 'primary',
      }),
    }),
  ],
})
export class AppModule {}
```

Then decorate a controller method. The event is sent **after** the handler resolves successfully,
and never if it throws.

```ts
// subscriptions.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { MetaEvent } from 'nestjs-meta-capi';
import { SubscriptionsService } from './subscriptions.service';

interface CreateSubscriptionDto {
  email: string;
}

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post()
  @MetaEvent<{ id: string; email: string }>({
    name: 'Lead',
    eventId: (subscription) => subscription.id,
    user: (subscription) => ({ email: subscription.email }),
    customData: () => ({ contentName: 'Newsletter Signup' }),
  })
  async create(@Body() dto: CreateSubscriptionDto) {
    return this.subscriptions.create(dto); // returns { id, email, ... }
  }
}
```

`MetaCapiModule` is global and registers its interceptor globally, so no per-controller wiring is
required. The interceptor returns immediately for routes that lack `@MetaEvent`.

## How it works

```
HTTP request
  → guards & pipes
  → MetaEventInterceptor reads @MetaEvent + @MetaDataset metadata (no metadata → pass through)
  → your controller handler
      ├── throws ──→ exception propagates unchanged, NO event
      └── resolves ──→ only for a 2xx response:
                        build the event (event_time captured at build time)
                        resolve the dataset (method → controller → default)
                        extract request context (fbc / fbp / IP / URL / user agent)
                        deliver via the SDK (async by default)
                        return your result UNCHANGED
```

In the default `async` mode, delivery happens off the request path so a Meta outage cannot fail the
business request. This is **fire-and-forget within the process, not durable** — for guaranteed
delivery, place an outbox/queue in front of it.

## Configuration

```ts
MetaCapiModule.forRoot({
  datasets: {
    primary: { datasetId: '123', accessToken: 'xxx' },
    secondary: { datasetId: '456', accessToken: 'yyy', testEventCode: 'TEST123' },
  },
  defaultDataset: 'primary', // optional; defaults to the first key
  delivery: { mode: 'async' }, // 'async' (default) | 'sync'
  retry: { enabled: true, maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 10_000 },
  logging: { enabled: true, level: 'error' },
  cookies: { enabled: false },
});
```

| Option                 | Type                                    | Default   | Notes                                                          |
| ---------------------- | --------------------------------------- | --------- | -------------------------------------------------------------- |
| `datasets`             | `Record<string, DatasetConfig>`         | —         | At least one. Each requires `datasetId` and `accessToken`.     |
| `defaultDataset`       | `string`                                | first key | Used when neither the event nor the decorators name a dataset. |
| `delivery.mode`        | `'async' \| 'sync'`                     | `'async'` | See [Delivery and retries](#delivery-and-retries).             |
| `retry.enabled`        | `boolean`                               | `true`    |                                                                |
| `retry.maxAttempts`    | `number`                                | `3`       | Must be `>= 1`.                                                |
| `retry.initialDelayMs` | `number`                                | `500`     | Exponential backoff with jitter, capped at `maxDelayMs`.       |
| `retry.maxDelayMs`     | `number`                                | `10000`   |                                                                |
| `logging.enabled`      | `boolean`                               | `true`    |                                                                |
| `logging.level`        | `'debug' \| 'log' \| 'warn' \| 'error'` | `'error'` |                                                                |
| `cookies.enabled`      | `boolean`                               | `false`   | Write `_fbc`/`_fbp` back as first-party cookies (see below).   |

Invalid configuration fails fast at startup with an actionable `MetaCapiConfigurationError`. Access
tokens never appear in an error message.

## Decorators

### `@MetaEvent<T>(options)`

Applied to a controller method. `T` is the resolved type of the handler's return value, and is what
the mappers receive.

| Option          | Type                                           | Notes                                                  |
| --------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `name`          | `string`                                       | **Required.** The Meta event name, e.g. `'Lead'`.      |
| `dataset`       | `string`                                       | Overrides `@MetaDataset` on the method and controller. |
| `eventId`       | `string \| (result) => string \| number`       | A property path (e.g. `'order.id'`) or a mapper.       |
| `actionSource`  | `string`                                       | Defaults to `'website'`.                               |
| `eventTime`     | `Date \| number \| (result) => Date \| number` | Defaults to the moment the event is built.             |
| `user`          | `(result, request, ctx) => MetaUserData`       | Pass raw values; the SDK hashes them.                  |
| `customData`    | `(result, request, ctx) => MetaCustomData`     | camelCase keys are converted to snake_case.            |
| `testEventCode` | `string`                                       | Explicit opt-in only; overrides the dataset's code.    |

### `@MetaDataset(name)`

Applied to a controller and/or a single method to bind it to a configured dataset. Resolution order
is `@MetaEvent({ dataset })` → method → controller → configured default.

```ts
@Controller('checkout')
@MetaDataset('secondary')
export class CheckoutController {}
```

## Programmatic use

Decorators are optional. `MetaCapiService.track()` also works outside a request — from scheduled
jobs, queue consumers, or CLI commands. Everything request-derived degrades gracefully to absent.

```ts
import { Injectable } from '@nestjs/common';
import { MetaCapiService } from 'nestjs-meta-capi';

@Injectable()
export class OrdersService {
  constructor(private readonly metaCapi: MetaCapiService) {}

  async complete(order: { id: string; email: string; amount: number }) {
    // ...business logic...

    await this.metaCapi.track({
      eventName: 'Purchase',
      eventId: order.id,
      userData: { email: order.email },
      customData: { value: order.amount, currency: 'USD', contentName: 'Premium Plan' },
      // `request` is optional; pass it to enable fbc/fbp/IP/URL autofill.
    });
  }
}
```

## Delivery and retries

| Mode                | Behaviour                                                                        | Use                  |
| ------------------- | -------------------------------------------------------------------------------- | -------------------- |
| `async` _(default)_ | Returns immediately; the send happens off the request path. Failures are logged. | Production default.  |
| `sync`              | Awaits the send; a delivery failure surfaces to the caller.                      | Only if you want it. |

Retries use exponential backoff with jitter and are limited to failures that can succeed on a later
attempt: connection errors, timeouts, HTTP 429, and 5xx responses. Authentication and validation
errors are never retried. `event_id` and `event_time` are held stable across attempts so
deduplication stays correct.

**Success is body-aware.** A 2xx status is not proof of success: Meta can return `200` with
per-event errors and/or `events_received: 0`. The package inspects the response body, not just the
HTTP status.

## Request context and PII

The interceptor forwards the request to Meta's Parameter Builder to fill in `fbc`, `fbp`,
`client_ip_address`, and `event_source_url`, and reads `client_user_agent` from the `user-agent`
header itself (the Parameter Builder does not cover it). This is what drives Event Match Quality.

- **Never pre-hash.** Pass raw `email` / `phone` / name values. Meta's SDK normalizes and SHA-256
  hashes them; pre-hashing double-hashes and silently destroys match quality.
- **Never logged.** The structured logger redacts secrets and raw PII at the logger boundary, and
  tokens never appear in error messages.

## Cookie write-back

Meta's Parameter Builder derives `_fbc` and `_fbp` for each request. By default the package only
_uses_ those values for the event. To let attribution survive across visits, opt in:

```ts
MetaCapiModule.forRoot({
  datasets: {/* ... */},
  cookies: { enabled: true },
});
```

When enabled, `cookiesToSet` is written back to the response as first-party `Set-Cookie` headers
(`Path=/`, `Max-Age`, `Domain`). The write-back happens in the interceptor — before the response is
flushed — so it works in both `async` and `sync` delivery, and in both Express and Fastify with no
additional plugins. It is **off** by default.

## Escape hatch

For advanced use, obtain the adapter handle for a dataset. It exposes the adapter, never raw SDK
classes.

```ts
const client = this.metaCapi.getClient('primary');

await client.send({
  eventName: 'CustomEvent',
  eventTime: Math.floor(Date.now() / 1000),
  actionSource: 'website',
  userData: { email: 'joe@example.com' },
  customData: {},
});
```

## Compatibility

The package is published in both module formats and resolves the appropriate one for your
application:

| Your application | Consumes         |
| ---------------- | ---------------- |
| NestJS 12 (ESM)  | `dist/index.js`  |
| NestJS 11 (CJS)  | `dist/index.cjs` |

## Testing

```bash
npm test          # unit + integration tests (Express and Fastify)
npm run test:cov  # with coverage (90% thresholds enforced)
```

Live tests call the real Meta API and are opt-in only:

```bash
META_LIVE_TEST=true META_LIVE_DATASET_ID=... META_LIVE_ACCESS_TOKEN=... npm run test:live
```

## Examples

A complete, compile-checked example lives in [`examples/basic`](./examples/basic) — module setup
with `forRootAsync`, a decorated controller, and programmatic `track()`. It is type-checked in CI
against the public API, so it cannot drift.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). For security issues, see [SECURITY.md](./SECURITY.md) —
please report privately, never in a public issue.

## License

[MIT](./LICENSE). The underlying `facebook-nodejs-business-sdk` and `capi-param-builder-nodejs` are
published by Meta under Meta's Platform License.
