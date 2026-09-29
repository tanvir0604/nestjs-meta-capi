# SPEC.md — Project Context & Build Specification

> **Purpose.** This is the single authoritative specification for this repository. A contributor
> should be able to read this file alone and implement, extend, review, or release the package
> correctly. It supersedes `THOUGHTS.txt`, which is retained only as the original discovery
> document.
>
> **Normative language.** `MUST` = hard requirement, violation is a bug. `SHOULD` = strong
> default, deviation requires a written justification in the PR. `MAY` = optional.
>
> **Conflict rule.** If code and this file disagree, this file is right — unless this file is
> stale. When you change behaviour, update this file in the same commit.

---

## 1. What we are building

A production-grade, open-source npm package providing an **idiomatic NestJS integration for
Meta's Conversions API (CAPI)**. It is a thin, opinionated integration layer over Meta's
official Node.js Business SDK — it does **not** reimplement the CAPI protocol, and it is **not**
a renamed SDK wrapper.

The value it adds is the NestJS developer experience: dependency injection, dynamic modules,
declarative decorators, a metadata-driven interceptor, multi-dataset resolution, request-context
wiring, event/user/custom-data mapping, delivery modes, retries, redaction-safe logging, and
strict TypeScript types.

**This is a serious package, not a demo.** Treat every change as if it ships to strangers.

### 1.1 Identity

| Field        | Value                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Package name | `nestjs-meta-capi`                                                                                                                    |
| Repository   | `github.com/tanvir0604/nestjs-meta-capi`                                                                                              |
| License      | `MIT`                                                                                                                                 |
| Description  | `Idiomatic NestJS integration for the Meta Conversions API, powered by Meta's official Node.js Business SDK.`                         |
| Keywords     | `nestjs`, `nest`, `nest-module`, `meta`, `facebook`, `conversions-api`, `capi`, `meta-capi`, `facebook-conversions-api`, `typescript` |

> **Name status (verified 2026-09-29):** `nestjs-meta-capi`, `nest-meta-capi`,
> `@nestjs-meta/capi`, and `nestjs-meta-conversions-api` are **all unclaimed on the npm
> registry** (HTTP 404). Default to the unscoped `nestjs-meta-capi` — it is the simplest path
> for trusted publishing and needs no org ownership. Switch to `@<org>/nestjs-meta-capi` only
> if an organisation scope is deliberately chosen.

### 1.2 Trademark / endorsement disclaimer (MUST appear in README)

> This package is an independent, community-maintained NestJS integration. It is **not** an
> official Meta or Facebook product and is not endorsed by or affiliated with Meta Platforms,
> Inc. It is powered by Meta's official Node.js Business SDK. "Meta", "Facebook", and
> "Conversions API" are trademarks of Meta Platforms, Inc.

---

## 2. Non-negotiables (the invariants)

These are the rules that define the package. If any is broken, the change is wrong.

1. **The official SDK is the transport.** All Meta API interaction goes through
   `facebook-nodejs-business-sdk`. Direct Graph API calls are forbidden except where the SDK
   cannot express the required behaviour, and then only behind the adapter with a comment citing
   why.
2. **Decorators attach metadata only.** `@MetaEvent()` and `@MetaDataset()` MUST NOT perform
   I/O, construct SDK objects, or send anything at decoration time. They set `Reflect`
   metadata. The interceptor does all work.
3. **Events fire only after a successful handler.** The event is dispatched _after_ the
   controller method resolves. If the handler throws, **no event is sent** — and the original
   exception propagates completely unmodified.
4. **Meta delivery failure MUST NOT fail the business request** in the default (`async`)
   delivery mode. The business operation already succeeded; a CAPI outage is not a business
   error.
5. **Multi-dataset is first-class.** Never assume a single dataset, a single pixel, or a single
   access token. See ADR-1 — this is the highest-risk area in the whole project.
6. **Never double-hash PII.** The SDK normalizes and SHA-256 hashes user data for us. Pass raw
   values. See ADR-3.
7. **Never log secrets or raw PII.** No access tokens, no raw email/phone/name, no
   `Authorization` headers. See §9.
8. **The public API is small and stable.** Internal classes are not exported. The SDK is
   reachable only through the documented adapter/escape hatch.
9. **No live Meta credentials in the default test suite.** All tests run against a fake
   transport. Live tests are opt-in behind an env flag and never run on PRs.
10. **Publishing is tag-driven and validated.** Never publish from a push to `main`. Never
    publish a version whose tag and `package.json` disagree. Never republish an existing
    version. See §11.4.

---

## 3. Stack & compatibility

| Component     | Choice                                   | Notes                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime       | Node.js `>=20`                           | `engines.node: ">=20"`. CI tests **20, 22, 24** (24 = active LTS "Krypton").                                                                                                                                               |
| Framework     | NestJS `^11 \|\| ^12`                    | `@nestjs/common` + `@nestjs/core` as **peer** dependencies. **12.1.1 is ESM-only** (`"type": "module"`, ESM syntax in `index.js`); 11.x is CommonJS. The APIs we use are identical across both, so one source serves both. |
| Language      | TypeScript 5.x, `strict: true`           | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` on. `any` forbidden without an inline justification comment. The config is verified against TS **5.9, 6.0 and 7.0**.                        |
| Module output | **Dual ESM + CJS** + `.d.ts`/`.d.cts`    | Forced by the ESM-only NestJS 12 peer — see ADR-11. The `exports` map sends `import` → `dist/index.js` (ESM) and `require` → `dist/index.cjs` (CJS).                                                                       |
| Meta SDK      | `facebook-nodejs-business-sdk` `^24.0.1` | **Direct dependency.** npm `license` field is `Platform License` (not MIT) — see ADR-12. Ships **no TypeScript types** and (in published releases) **no Parameter Builder** — see Spike 1 outcome (§14.1).                 |
| Test runner   | Jest (ESM)                               | ts-jest with `useESM: true`, run under `node --experimental-vm-modules` because the NestJS 12 peer is ESM. Coverage thresholds enforced at 90%.                                                                            |
| Lint/format   | ESLint (typescript-eslint) + Prettier    | Zero warnings tolerated in CI.                                                                                                                                                                                             |
| Build tool    | `tsup` (esbuild + rollup dts)            | Emits ESM, CJS and both declaration files. `tsc` cannot emit CJS under `node16` resolution against an ESM-only peer (ADR-11).                                                                                              |

**Required peer dependencies:** `@nestjs/common`, `@nestjs/core`, `rxjs@^7.1.0`,
`reflect-metadata@^0.1.12 || ^0.2.0`.

**Runtime dependencies:**

- `facebook-nodejs-business-sdk@^24.0.1` — the transport; all Meta API interaction.
- `capi-param-builder-nodejs@^1.3.2` — request-context extraction and PII normalization. Meta's
  own package (Platform License). **Required only until the SDK publishes its bundled Parameter
  Builder** — see Spike 1 outcome (§14.1). Every additional dependency must be justified in the PR.

---

## 4. Architecture

### 4.1 Layering

```
NestJS application
      │  (decorators, DI, interceptor, request context)
      ▼
nestjs-meta-capi            ← this package: mapping, resolution, policy, logging
      │  (adapter isolates everything below)
      ▼
MetaSdkAdapter              ← the ONLY module that imports the official SDK
      ▼
facebook-nodejs-business-sdk
      ▼
Meta Conversions API
```

The adapter boundary (ADR-10) is what makes the public API survive SDK upgrades.

### 4.2 Source layout

```
src/
├── decorators/
│   ├── meta-event.decorator.ts          # @MetaEvent — metadata only
│   └── meta-dataset.decorator.ts        # @MetaDataset — metadata only
│   # @MetaUser — deferred past v1 (§15)
├── interceptors/
│   └── meta-event.interceptor.ts        # post-handler dispatch
├── services/
│   └── meta-capi.service.ts             # public MetaCapiService
├── clients/                             # the SDK boundary (ADR-10)
│   ├── meta-sdk.adapter.ts              # MetaSdkAdapter interface + our types
│   ├── business-sdk.adapter.ts          # the only SDK *object* import site
│   ├── http-service.transport.ts        # HttpServiceInterface impl (ADR-1)
│   ├── request-context.ts               # Parameter Builder wiring (fbc/fbp/IP/UA/url)
│   └── fetch.executor.ts                # default HTTP executor (global fetch)
├── builders/
│   ├── event.builder.ts                 # assembles the normalized event + defaults
│   ├── user-data.builder.ts             # raw pass-through, NO hashing
│   ├── custom-data.builder.ts           # camelCase → snake_case
│   └── to-snake-case.ts                 # key conversion helper
├── transports/
│   ├── meta-event.transport.ts          # MetaEventTransport interface
│   ├── immediate.transport.ts           # default: resolve → normalize → deliver + retries
│   └── retry-policy.ts                  # classification + backoff (§10.2)
├── http/
│   └── cookie-writer.ts                 # framework-agnostic Set-Cookie write-back (ADR-8)
├── logging/
│   └── meta-capi.logger.ts              # redacting structured logger (§9)
├── config/
│   ├── meta-capi.options.ts             # public options types
│   ├── meta-capi.tokens.ts              # DI tokens
│   └── validate-options.ts              # startup validation (§7)
├── errors/                              # §8
├── types/                               # public types + the SDK ambient declarations
├── meta-capi.module.ts                  # forRoot / forRootAsync + global wiring
└── index.ts                             # the public API surface ONLY
```

> **ADR-10 boundary in practice.** All `facebook-nodejs-business-sdk` imports live in
> `src/clients/`. `business-sdk.adapter.ts` is the only file that constructs SDK objects;
> `http-service.transport.ts` implements the SDK's `HttpServiceInterface` and is inherently
> SDK-coupled. Nothing outside `src/clients/` imports the SDK.

### 4.3 Request lifecycle

```
HTTP request
  → NestJS guards & pipes
  → [MetaEventInterceptor: read @MetaEvent + @MetaDataset metadata; if absent, pass through]
  → controller method + business logic
      ├── throws ──→ rethrow unchanged, NO event
      └── resolves ──→ [gate on response status (ADR-7)]
                        → build ServerEvent (event_time captured now, ADR-2)
                        → setRequestContext(req) so the SDK fills fbc/fbp/ip/urls
                        → resolve dataset (method → controller → default)
                        → dispatch via transport (async default, ADR-6)
                        → return the original result UNCHANGED
```

---

## 5. Public API contract

Everything below is exported from `src/index.ts`. Nothing else is.

### 5.1 Module

```ts
MetaCapiModule.forRoot({
  datasets: {
    primary: { datasetId: '123', accessToken: 'xxx' },
    marketing: { datasetId: '456', accessToken: 'yyy', testEventCode: 'TEST123' },
  },
  defaultDataset: 'primary', // optional; else first key, else must be explicit
  delivery: { mode: 'async' }, // 'async' (default) | 'sync'
  retry: { enabled: true, maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 10_000 },
  logging: { enabled: true, level: 'error' },
});

MetaCapiModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({/* same shape */}),
});
```

`forRootAsync` is the **recommended production** configuration. The package MUST NOT read
`process.env` directly — apps supply values through NestJS config.

### 5.2 Decorators

```ts
@MetaDataset('primary')                    // on a controller and/or a method
@MetaEvent({
  name: 'Lead',                            // required; Meta event name
  dataset: 'marketing',                    // optional; overrides @MetaDataset
  eventId: (result) => result.id,          // string property path | mapper | undefined
  actionSource: 'website',                 // default 'website' (ADR-2)
  eventTime: (result) => Date,             // optional override
  user: (result, request, ctx) => ({ email: result.email, phone: result.phone }),
  customData: (result) => ({ currency: 'USD', value: result.amount, contentName: 'Newsletter Signup' }),
  testEventCode: 'TEST123',                // explicit opt-in only (ADR-9)
})
@Post()
async createLead(@Body() dto: CreateLeadDto) { /* ... */ }
```

### 5.3 Service (decorators are optional)

```ts
await this.metaCapi.track({
  dataset: 'primary',
  eventName: 'Lead',
  eventId: lead.id,
  userData: { email: lead.email },
  customData: { contentName: 'Newsletter Signup' },
  request, // optional; enables request-context autofill
});
```

The service MUST work outside an HTTP context (cron jobs, queue consumers, CLI) — `request` is
optional and everything request-derived degrades gracefully to absent.

### 5.4 Escape hatch

```ts
const client = this.metaCapi.getClient('primary'); // returns the adapter handle, not raw SDK types
```

Advanced users may reach the SDK through this, but raw SDK classes MUST NOT appear in the public
type surface.

### 5.5 Public types

`MetaCapiModuleOptions`, `DatasetConfig`, `MetaEventOptions<T>`, `MetaEventMapper<T>`,
`MetaUserData`, `MetaCustomData`, `MetaEventPayload`, `MetaRequestLike`, `DeliveryMode`,
`RetryOptions`, `LoggingOptions`, `CookieOptions`, `MetaRequestContext`, `MetaEventTransport`,
`MetaSdkClientHandle`, plus the error classes in §8.

---

## 6. Meta SDK integration contract

This table is the contract between our builders and the SDK. Implement it exactly.

| Our input           | SDK call                                                                                                    | Notes                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`              | `ServerEvent.setEventName()`                                                                                | required                                                                                                               |
| _(always)_          | `ServerEvent.setEventTime()`                                                                                | **The SDK does not set or validate this.** Capture at event construction, not at send time, so retries don't shift it. |
| `actionSource`      | `ServerEvent.setActionSource()`                                                                             | default `'website'`. Required by Meta; SDK does not default it.                                                        |
| `eventId`           | `ServerEvent.setEventId()`                                                                                  | never regenerate on retry (§10.2)                                                                                      |
| `user`              | `UserData.set*()`                                                                                           | **raw values only** — no hashing (ADR-3)                                                                               |
| `customData`        | `CustomData.set*()`                                                                                         | camelCase → snake_case (`contentName` → `content_name`)                                                                |
| `request`           | `capi-param-builder-nodejs`: `ParamBuilder.processRequestFromContext(request)`, then set the derived values | **required for EMQ.** The published SDK has no `setRequestContext` — see Spike 1 outcome (§14.1)                       |
| `testEventCode`     | `EventRequest.setTestEventCode()`                                                                           | request-level                                                                                                          |
| dataset token       | `EventRequest(accessToken, datasetId, ...)`                                                                 | see ADR-1 — do not rely on the global init                                                                             |
| `client_user_agent` | `UserData.setClientUserAgent()`                                                                             | **NOT auto-filled** — read `user-agent` ourselves                                                                      |

**Published-SDK reality (Spike 1 outcome, §14.1).** `ServerEvent.setRequestContext()` and
`Preference` exist **only on the SDK's `main` branch** (SDK 26.x / Graph v26.0) and are **absent
from every published npm release**, including `24.0.1`. Do **not** assume they exist. Until the
SDK publishes the bundled builder, obtain these from Meta's standalone
`capi-param-builder-nodejs` and set them explicitly:

- `user_data.fbc`, `user_data.fbp`, `user_data.client_ip_address` — via `UserData.setFbc()`,
  `setFbp()`, `setClientIpAddress()`
- `event_source_url`, `referrer_url` — via `ServerEvent.setEventSourceUrl()`, `setReferrerUrl()`

When the SDK ships the bundled builder, switch to `setRequestContext(request)` — it is
non-destructive (explicitly-set values always win) and order-independent. Either way, do not
hand-roll the extraction logic. **Verify against the installed package, not the GitHub README:
the README on `main` documents features npm does not have.**

**`client_user_agent` is explicitly not covered by the Parameter Builder** — this package MUST
read it from the request headers and set it. Omitting it is a common, silent EMQ regression.

**Cookie write-back (ADR-8):** the Parameter Builder returns `cookiesToSet` for `_fbc`/`_fbp`.
When `cookies: { enabled: true }` is set, the package writes those as first-party cookies so
attribution survives across visits. Default off.

---

## 7. Configuration validation (startup, fail fast)

Validate in `forRoot`/`forRootAsync` and throw `MetaCapiConfigurationError` with an actionable
message. Detect: missing/empty `datasetId`, missing/empty `accessToken`, invalid dataset name,
`defaultDataset` not present in `datasets`, duplicate dataset keys, unsupported `delivery.mode`,
and invalid retry values (`maxAttempts < 1`, negative delays, `initialDelayMs > maxDelayMs`).

```
MetaCapi configuration error: dataset "primary" is missing "accessToken".
```

Also warn (do not throw) when `testEventCode` is set while `NODE_ENV === 'production'` — that is
almost always a mistake (§ADR-9). **Never print a token, even partially, in any error.**

---

## 8. Error model

```ts
MetaCapiError                    // base; carries dataset name, event name, event id, fbtrace id
└── MetaCapiConfigurationError   // thrown at startup
└── MetaCapiValidationError      // bad event input
└── MetaCapiDeliveryError        // Meta rejected the request
└── MetaCapiRetryExhaustedError  // all attempts failed (wraps the last error)
```

Every error MUST preserve enough context to debug (`dataset`, `eventName`, `eventId`,
`fbtrace_id`, HTTP status) while exposing **no secrets and no raw PII**.

---

## 9. Logging, security & PII

- One structured logger behind a NestJS-compatible abstraction; `level` and `enabled` are
  configurable. No stray `console.log` anywhere (lint-enforced).
- **Never log:** access tokens, app secrets, `Authorization`/`Cookie` headers, raw email, raw
  phone, raw names, or full request bodies.
- **Safe to log:** dataset name, event name, event id, delivery mode, attempt number, HTTP
  status, Meta `fbtrace_id`, `events_received`, and a correlation/request id when available.
- Redaction happens at the logger boundary, not at each call site, so it cannot be forgotten.
- `SECURITY.md` MUST document the vulnerability-reporting path, the "never commit Meta tokens"
  rule, and the PII posture.

---

## 10. Reliability semantics

### 10.1 Delivery modes

| Mode                  | Behaviour                                                               | Use                                                           |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `async` (**default**) | Interceptor returns immediately; the send happens off the request path. | Production default.                                           |
| `sync`                | The request awaits the send; failure can surface to the caller.         | Only when the app explicitly wants it. Document the tradeoff. |

`async` is **fire-and-forget in-process, not durable**. It MUST attach a terminal `.catch()` so a
rejection can never become an unhandled rejection that kills the process. Every detached send
logs its failure through the structured logger.

### 10.2 Retry policy

Exponential backoff with jitter, capped at `maxDelayMs`. Retry **only** classes of error that can
succeed on a later attempt: connection errors, timeouts, HTTP 429, and HTTP 5xx. **Never retry**
authentication failures or validation/4xx errors — those will fail identically and just multiply
load. On retry, keep the **same `event_id` and `event_time`** so dedup and attribution stay
correct. Concrete Meta error codes worth classifying are enumerated during implementation from
Meta's error reference (see §14, spike 5).

### 10.3 Success detection — body-aware (ADR-5)

**A 2xx is not proof of success.** Meta returns 200 with an `events_received` count and a
`messages` array that can carry per-event errors. Success requires inspecting `EventResponse`:

```
success  ⇔  no per-event error messages  AND  events_received ≥ 1
```

Logging and retry classification MUST use this, never the HTTP status alone.

---

## 11. Architecture decisions (ADR)

Each decision: the call, why, and the consequence you must live with.

**ADR-1 — Use a custom `HttpServiceInterface` as the default send path (highest priority).**
`EventRequest`'s constructor calls `FacebookAdsApi.init(this._access_token)`, which mutates a
**process-global singleton**. With multiple datasets holding different tokens, concurrent sends
can cross-contaminate tokens; `FacebookAdsApi.GRAPH`/`VERSION` are also global, so API version
cannot be pinned per dataset. When an HTTP service is set, `execute()` bypasses the singleton and
passes `access_token` as a request parameter — which is per-call and safe. Therefore the default
transport MUST supply an `HttpServiceInterface`, and a concurrency test MUST prove two datasets
with different tokens never bleed into each other.
_Consequence:_ our `executeRequest(url, method, headers, params)` returns directly as the value
of `EventRequest.execute()`, so it must resolve to an `EventResponse`-compatible object
(construct it from the parsed JSON body: `events_received`, `messages`, `fbtrace_id`, `id`,
`num_processed_entries`). Implement carefully and cover with tests. Also note the SDK's own
documented limitation that a custom HTTP service is not supported for its concurrent-batch and
async request paths.

**ADR-2 — Supply the defaults the SDK won't.**
The SDK neither sets nor validates `event_time` and `action_source` (verified in
`server-event.js` — there is no validation that throws). A missing `event_time` ships an invalid
event. So the package MUST default `event_time` to `Math.floor(Date.now()/1000)` at construction
time and `action_source` to `'website'`, both overridable. `event_source_url` is required for
`action_source: 'website'` and is **not** auto-filled by published SDK versions (see §14.1), so
source it from the request via the Parameter Builder and set it explicitly.

**ADR-3 — Never hash PII ourselves.**
In Node.js the SDK's Parameter Builder normalizes and SHA-256 hashes `UserData` customer fields
(email, phone, name, DOB, gender, city, state, zip, country, external_id). _(Verified
empirically: on `24.0.1`, `UserData.normalize()` returns `em`/`ph` as 64-char hex digests.)_
Pre-hashing produces double-hashed values that silently destroy match quality. Pass raw values
through; document exactly which transformations are delegated to the SDK.

**ADR-4 — The interceptor is registered globally and metadata-gated.**
Because decorators must not do work (invariant 2), the module registers `MetaEventInterceptor`
via `APP_INTERCEPTOR` in its providers, and the interceptor no-ops instantly for any route
lacking `@MetaEvent` metadata. This makes the package "just work" after `forRoot()` with zero
per-controller wiring. Document the interceptor-ordering implication for apps that also use
global interceptors.

**ADR-5 — Body-aware success detection.** See §10.3.

**ADR-6 — `async` means off-request-path, not durable.**
Document plainly that `async` gives latency isolation but not delivery guarantees; for
durability recommend the outbox → queue → CAPI architecture. A `MetaEventTransport` interface
(`send(payload): Promise<void>`) keeps a future `BullMqTransport` possible **without making
BullMQ a dependency of core**.

**ADR-7 — Gate on response status, not just "didn't throw".**
A handler can return normally while the response status is 5xx (e.g. `@HttpCode`). Events
MUST fire only for successful (2xx) responses.

**ADR-8 — Write back `_fbc`/`_fbp` cookies.**
_(Status: implemented, opt-in via `cookies: { enabled: true }`; default off.)_
Persist the Parameter Builder's `cookiesToSet` as first-party cookies so attribution survives
across sessions. Response access lives in the HTTP layer, so the **interceptor** performs the
write-back (`src/http/cookie-writer.ts`), not the transport — this also means it works in both
`async` and `sync` delivery, since the interceptor runs before the response is flushed. When it
is enabled, the interceptor extracts the request context once and passes it to the transport so
the written cookie and the sent `fbp`/`fbc` cannot diverge. Serialization is deliberately
framework-agnostic (`append` → `header` → `setHeader`) so Express and Fastify both work without
extra plugins.

**ADR-9 — Test-event codes are explicit opt-in.**
`testEventCode` is only applied when explicitly configured on a dataset (or overridden per
event). Never default it. Warn at startup if it's set in production.

**ADR-10 — Isolate the SDK behind `MetaSdkAdapter`.**
All `facebook-nodejs-business-sdk` imports are confined to `src/clients/`. `business-sdk.adapter.ts`
is the only file that constructs SDK objects; `http-service.transport.ts` implements the SDK's
`HttpServiceInterface` and is inherently SDK-coupled. The public API and all builders talk to
our own types, so an SDK major upgrade is an adapter change, not a breaking release.

**ADR-11 — Ship a dual ESM + CJS build.**
_(Revised 2026-09-29 — the original "CJS first" call assumed a CommonJS NestJS 12, which the
registry does not ship: `@nestjs/common@12.1.1` is ESM-only (`"type": "module"`). With
`moduleResolution: "node16"` TSC refuses to `require()` an ESM-only peer (`TS1479`), so a CJS-only
build cannot even type-check against the installed peer.)_
Emit both formats via `tsup`: ESM as the `import` target (what NestJS 12 consumes) and CJS as the
`require` target (what NestJS 11 apps consume), each with matching `.d.ts`/`.d.cts`, wired through
an `exports` map. `sideEffects: false` and treeshaking keep both lean. Consequence: the build
depends on a bundler (`tsup`), not `tsc` alone — `tsc` remains the type-checker.

**ADR-12 — Record the dependency licence honestly.**
`facebook-nodejs-business-sdk` is published under the **Platform License**, not MIT. Our package
is MIT, but the README MUST state that the underlying SDK carries its own licence, and the
dependency is listed as a direct `dependency` (not bundled, not vendored).

---

## 12. Testing strategy

The bar is "a maintainer trusts this in production". Required coverage:

- **Config:** valid; missing token; missing dataset id; bad `defaultDataset`; duplicate names;
  invalid retry; unknown delivery mode; token never appears in any error.
- **Decorators:** metadata written correctly; controller-level inheritance; method overrides
  controller; **and explicitly that decoration performs no I/O** (invariant 2).
- **Interceptor:** success → dispatched; throw → **not** dispatched and original exception
  identity preserved; 5xx-with-normal-return → not dispatched; result returned unchanged;
  non-2xx/`HttpException` paths.
- **Mapping:** `eventId` as property path / mapper / absent; user mapping; custom-data mapping
  incl. camelCase→snake_case; `event_time`/`action_source` defaults applied.
- **Delivery:** success; Meta rejects; retry then success; retry exhaustion; `sync` vs `async`;
  detached `async` rejection is caught and never becomes unhandled.
- **ADR-1 concurrency:** two datasets, two tokens, concurrent sends → correct token per request.
- **Success detection:** 200 with `messages` errors and/or `events_received: 0` is treated as
  failure.
- **Request context:** fbc/fbp extraction, client IP, user agent, event source URL, referrer —
  using synthetic `http.IncomingMessage` fixtures (no live credentials).
- **Express and Fastify:** at least one integration test boots a real NestJS app per adapter and
  asserts an event is emitted after a successful handler and not after a throwing one.
- **Security:** assert redaction — tokens and raw email/phone never reach the log sink.

**Coverage target:** ≥90% lines/branches/statements/functions on `src/`, enforced as Jest
thresholds (`coverageThreshold`). Any exclusion MUST carry a comment explaining why.

**Live tests:** opt-in only, gated behind `META_LIVE_TEST=true`, requiring real credentials, and
**never executed on pull requests**. They live in `test/live/*.live.spec.ts` and are excluded from
the default run by `testPathIgnorePatterns`; `npm run test:live` re-targets them.

---

## 13. Build, packaging, CI/CD

### 13.1 package.json essentials

```jsonc
{
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" },
    },
  },
  "files": ["dist", "README.md", "LICENSE", "CHANGELOG.md"],
  "sideEffects": false,
  "engines": { "node": ">=20" },
  "publishConfig": { "access": "public", "provenance": true },
}
```

`files` is an **allowlist**. `src/`, tests, `.github/`, coverage, and `.env*` MUST NOT ship.
`npm pack --dry-run` is a required, inspected gate — not a formality.

### 13.2 Scripts

`build`, `lint`, `format`, `format:check`, `typecheck`, `test`, `test:cov`, `test:live`,
`pack:check` (`npm pack --dry-run`), `release`. `format`/`format:check` cover `{src,test,examples}`;
`typecheck` runs **two** projects — `tsconfig.json` (src + test) and `examples/tsconfig.json`
(the example app, resolved to `src/index.ts` via a path alias).

> **Local dev note.** If the environment sets `NODE_ENV=production`, npm's default `omit=dev`
> silently skips devDependencies — install with `npm install --include=dev`. CI must not inherit
> that setting.

> **One tsconfig + a bundler.** `tsconfig.json` covers `src/**`, `test/**` and `tsup.config.ts`
> with `noEmit: true`; `tsc` is the type-checker only. Emission is owned by `tsup`
> (`tsup.config.ts`), which produces the dual build — so no `tsconfig.build.json` with
> `rootDir`/`outDir` is needed, and the editor never reports `ts(6059)`.

> **Use `moduleResolution: "bundler"`, not `"node16"`/`"node10"`.** Because we bundle, `bundler`
> resolution is the correct model: it does not demand `.js` extensions on relative imports and it
> tolerates the ESM-only NestJS 12 peer. `"node10"` (the old `"node"`) is deprecated in TS 6 and
> **removed** in TS 7 (`TS5108`) — do not use it. `types: ["node", "jest"]` is set explicitly so
> test globals resolve deterministically.

> **Jest runs in ESM.** `jest.config.cjs` sets `extensionsToTreatAsEsm: ['.ts']` and ts-jest
> `useESM: true`; the `test`/`test:cov` scripts invoke `node --experimental-vm-modules`. In ESM
> mode Jest does **not** inject the `jest` global — import it from `@jest/globals`. Coverage
> thresholds (90% on all four metrics) are enforced via `coverageThreshold`.

### 13.3 CI (`ci.yml`) — on every PR and push to `main`

`npm ci` → `lint` → `format:check` → `typecheck` → `test:cov` → `build` → `pack:check`.
Matrix: Node **20, 22, 24**; plus one compatibility job on the lowest supported NestJS major.
Any failing step fails CI. Permissions are least-privilege (`contents: read`).

### 13.4 Release (`release.yml`) — on `v*` tags, and only there

Order: verify `tag === package.json.version` → verify the version is **not already published** →
re-run the full validation chain → `npm pack` → publish via **npm Trusted Publishing (OIDC)**

```
permissions:
  contents: read      # + contents: write only if creating the GitHub Release inline
  id-token: write
```

Then create the GitHub Release with notes grouped from conventional commits.

- **No long-lived `NPM_TOKEN`.** If trusted publishing is unavailable for a case, document why.
- npm currently documents Node 22.14+ and npm 11.5.1+ for trusted publishing — **re-verify at
  implementation time**, these move.
- Provenance is generated automatically by trusted publishing; do not hand-add flags. Verify it
  appears on the published version.
- **First-publish caveat:** trusted publishing generally cannot create a _brand-new_ package
  name. Expect to perform the initial `1.0.0` publish once out-of-band (or configure a pending
  trusted publisher on npm) and then switch to pure OIDC. **Resolve this before wiring the
  workflow** — see §14.
- Provenance requires a **public** repository and package.
- Never overwrite an existing version; re-runs must fail clearly or skip safely.

### 13.5 Also required

`codeql.yml`, Dependabot for `npm` + `github-actions` on a weekly schedule, and pinned action
versions (SHAs). No `write-all` anywhere.

---

## 14. Required spikes before/early in implementation

Do these first — each one de-risks a decision that is expensive to reverse.

1. ✅ **DONE (2026-09-29) — multi-dataset token isolation (ADR-1).** `HttpServiceTransport`
   implemented at `src/clients/http-service.transport.ts`; `test/multi-dataset-isolation.spec.ts`
   proves three datasets with different tokens never cross-contaminate, and separately
   demonstrates the hazard on the SDK default path. See §14.1.
2. ✅ **DONE — `HttpServiceInterface` return contract.** Confirmed empirically: `execute()`
   returns our resolved `EventResponse` verbatim, and hands us `.../v24.0/<pixel>/events` with a
   per-call `params.access_token`.
3. **Request-context extraction under both adapters.** Prove extraction populates
   fbc/fbp/IP/URLs from an Express request _and_ a Fastify request, and capture
   `client_user_agent` ourselves. **Use `capi-param-builder-nodejs`** — `setRequestContext` does
   not exist in any published SDK release (§14.1).
4. **First-publish path (§13.4).** Determine exactly how the initial version gets onto npm, then
   encode it.
5. **Retry classification.** Read Meta's error reference and enumerate concrete retryable vs
   non-retryable codes; then encode them in one place with tests.
6. **Parameter Builder on published versions.** Wire `capi-param-builder-nodejs`, confirm
   `processRequestFromContext` accepts an Express _and_ a Fastify request, and record the
   `cookiesToSet` write-back path (ADR-8).

### 14.1 Spike 1 outcome — completed 2026-09-29

Run against the **installed, published** SDK (`facebook-nodejs-business-sdk@24.0.1`, Graph
`v24.0`), not the repo `main`:

- **The custom HTTP service path is genuinely isolated.** `execute()` invoked our
  `executeRequest` with `https://graph.facebook.com/v24.0/<pixel>/events` and a per-call
  `params.access_token` — instance values, never the global. Our resolved `EventResponse` was
  returned verbatim. ADR-1's fix is validated.
- **The hazard is real and reproducible.** After constructing requests for datasets A then B,
  `FacebookAdsApi.getDefaultApi().accessToken` is B's token and — decisively —
  `new AdsPixel('pixel-a').getApi().accessToken` is **also** B's. `AbstractCrudObject` resolves
  `api || FacebookAdsApi.getDefaultApi()`, so an object bound to dataset A sends with dataset B's
  credentials on the default path. **The package must never use the SDK's default send path.**
- **PII hashing is already done** by the published SDK (`UserData.normalize()` returns 64-hex
  `em`/`ph`), so ADR-3 stands: pass raw values, never pre-hash.
- **Graph API version is a process-global static** (`FacebookAdsApi.VERSION === 'v24.0'`), so it
  cannot be pinned per dataset. Pin it by pinning the SDK dependency.
- **Correction:** `setRequestContext()`/`Preference` are **absent from every published npm
  release** — npm's highest version is `24.0.1`. They exist only on `main` (SDK 26.x). Treat the
  SDK's GitHub README as **ahead of** npm. Request-context extraction therefore uses the
  standalone `capi-param-builder-nodejs@1.3.2` until the SDK publishes the bundled builder.
- **No TypeScript declarations ship with the SDK**, so `src/types/facebook-nodejs-business-sdk.d.ts`
  is a maintained part of the adapter (ADR-10) and MUST be reviewed on every SDK upgrade.

---

## 15. Open decisions

| #   | Decision                                                     | Default if unanswered                                                 |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1   | Unscoped `nestjs-meta-capi` vs `@<org>/…`                    | Unscoped (verified available, simplest OIDC)                          |
| 2   | Widen NestJS peer range to include 10                        | No — start `^11 \|\| ^12`                                             |
| 3   | Dual ESM output                                              | **Yes — shipped** (ADR-11, revised 2026-09-29: NestJS 12 is ESM-only) |
| 4   | Cookie write-back feature                                    | **Yes — shipped, default off** (ADR-8)                                |
| 5   | Typed convenience methods (`trackLead()`, …)                 | Defer past v1; `track()` is the contract                              |
| 6   | `@MetaUser()` param decorator                                | Defer past v1                                                         |
| 7   | `BullMqTransport`                                            | Out of scope; keep the interface seam                                 |
| 8   | Request-context source until the SDK ships a bundled builder | `capi-param-builder-nodejs` as a direct dependency (§14.1)            |

---

## 16. Definition of done

**Functional.** Official SDK used · dynamic module with `forRoot` + `forRootAsync` · multi-dataset
with precedence (method → controller → default) · `@MetaDataset` · `@MetaEvent` · metadata-only
decorators · interceptor dispatches only on success and never on throw · event id / user / custom
data mapping · `event_time` + `action_source` defaults · request context via
`capi-param-builder-nodejs`
· `client_user_agent` set · Express **and** Fastify verified · service API works outside HTTP
contexts · test-event opt-in with production warning · retries with backoff and sane
classification · body-aware success detection · tokens never logged.

**Quality.** Strict TS · ESLint + Prettier clean · unit + integration tests · ≥90% coverage
enforced · build succeeds · `npm pack --dry-run` inspected and clean · no unnecessary
dependencies · public API documented.

**Repository.** README (all sections, copy-paste-runnable) · LICENSE (MIT) · CHANGELOG
(Keep a Changelog) · CONTRIBUTING · SECURITY · CODE_OF_CONDUCT · CI · CodeQL · Dependabot ·
release workflow · Issue templates.

**Release.** A maintainer can `git clone` → `npm ci` → `npm test` → `npm run lint` →
`npm run typecheck` → `npm run build` and everything passes; then tag `v1.0.0` and have CI
validate, publish via OIDC, produce provenance, and create the GitHub Release.

**Developer experience.** The common case is one decorator:

```ts
@Post()
@MetaEvent({ name: 'Lead', eventId: (r) => r.id })
async createLead(@Body() dto: CreateLeadDto) { return this.leadService.create(dto); }
```

Nobody using this package should ever write `new ServerEvent()`, `new UserData()`,
`new CustomData()`, or `new EventRequest()` for a normal integration.

---

## 17. Conventions

- **Commits:** Conventional Commits — `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`,
  `ci:`, `build:`. CI enforces the format.
- **Branches:** `main` (protected, releasable) + short-lived `feat/…`, `fix/…`. Releases are cut
  from `main` by tag.
- **Code:** follow existing patterns; comment only where intent is non-obvious; no `console.log`;
  no unused variables; consistent import ordering; example code in docs MUST compile.
- **Docs:** every public API has a README section with a real, runnable example. Examples under
  `examples/` compile **without real credentials** and are type-checked in CI via
  `examples/tsconfig.json` (the `typecheck` script runs both projects).
- **Docs discipline:** exactly one normative definition of each API in this file. If a rule
  changes, change it here — do not restate it in three places.

---

## 18. Verification log

Facts below were verified against primary sources on **2026-09-29**; re-verify before relying on
them if significant time has passed.

| Claim                                                                                                                | Status                   | Source                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate package names are unclaimed on npm                                                                         | ✅ verified (HTTP 404)   | npm registry                                                                                                                              |
| **`setRequestContext()`/`Preference` exist only on `main` (SDK 26.x) — absent from every published npm release**     | ✅ verified (empirical)  | installed `facebook-nodejs-business-sdk@24.0.1`: `ServerEvent.prototype.setRequestContext === undefined`; npm highest version is `24.0.1` |
| Standalone `capi-param-builder-nodejs` is published (`1.3.2`, Platform License)                                      | ✅ verified              | npm registry                                                                                                                              |
| NestJS is an explicitly supported framework for `processRequestFromContext`                                          | ✅ verified              | capi-param-builder NodeJS README                                                                                                          |
| SDK normalizes + SHA-256 hashes `UserData` PII in Node.js                                                            | ✅ verified (empirical)  | `UserData.normalize()` on `24.0.1` → `em`/`ph` 64-hex                                                                                     |
| SDK does **not** validate/set `event_time` or `action_source`                                                        | ✅ verified              | `server-event.js` — no throwing validation                                                                                                |
| `EventRequest` constructor mutates the global `FacebookAdsApi.init()` singleton                                      | ✅ verified              | `event-request.js` constructor; `api.js` `init()` → `setDefaultApi()`                                                                     |
| SDK default path cross-contaminates tokens (`new AdsPixel('pixel-a').getApi().accessToken` → last token set)         | ✅ verified (empirical)  | spike + `abstract-crud-object.js` (`api \|\| FacebookAdsApi.getDefaultApi()`)                                                             |
| Multi-dataset token isolation holds on the custom HTTP service path                                                  | ✅ verified (empirical)  | `test/multi-dataset-isolation.spec.ts`                                                                                                    |
| `EventResponse` exposes `events_received` + `messages`                                                               | ✅ verified              | `event-response.js`                                                                                                                       |
| Custom `HttpServiceInterface.executeRequest()` result is returned directly by `execute()`                            | ✅ verified (empirical)  | `event-request.js`; spike: per-call `access_token`, our `EventResponse` returned verbatim                                                 |
| Graph API version is a process-global static (`v24.0` on the published SDK)                                          | ✅ verified              | installed SDK + `api.js`                                                                                                                  |
| SDK ships no TypeScript declarations                                                                                 | ✅ verified              | npm manifest (`types: none`); only `dist/*.js`                                                                                            |
| `client_user_agent` is not covered by the Parameter Builder                                                          | ✅ verified              | SDK README / features doc                                                                                                                 |
| SDK offers async requests, `BatchProcessor`, and HTTP service overrides                                              | ✅ verified              | Business SDK features doc                                                                                                                 |
| Custom HTTP service unsupported for SDK concurrent-batch/async paths                                                 | ✅ verified              | Business SDK features doc (Limitations)                                                                                                   |
| `facebook-nodejs-business-sdk` latest `24.0.1`, licence `Platform License`                                           | ✅ verified              | npm registry                                                                                                                              |
| NestJS latest `12.1.1`; requires Node `>=20`                                                                         | ✅ verified              | npm registry                                                                                                                              |
| **`@nestjs/common`/`@nestjs/core` 12.1.1 are ESM-only** (`"type": "module"`, `import`/`export` syntax in `index.js`) | ✅ verified (empirical)  | installed package; `tsc` with `moduleResolution: "node16"` raises `TS1479` against it                                                     |
| Node active LTS = 24 (Krypton)                                                                                       | ✅ verified              | nodejs.org/dist                                                                                                                           |
| **Full suite (typecheck, build, 120 tests) passes against NestJS 11.2.6 as well as 12.1.1**                          | ✅ verified (empirical)  | scratch install of `@nestjs/*@^11`; `tsc`, `tsup`, `jest` all green                                                                       |
| TypeScript latest is `7.0.2`; `6.0.3` is the current 6.x                                                             | ✅ verified              | npm registry                                                                                                                              |
| `moduleResolution: "node10"` (the old `"node"`) is deprecated in TS 6 and **removed** in TS 7 (`TS5108`)             | ✅ verified (reproduced) | `tsc` 6.0.3 / 7.0.2 against the project config                                                                                            |
| `"module": "commonjs"` + `moduleResolution: "node16"` is invalid (`TS5110`)                                          | ✅ verified              | `tsc` 5.9.3 / 7.0.2                                                                                                                       |
| `"module": "node16"` + `"moduleResolution": "node16"` type-checks and emits CommonJS on TS 5.9.3 / 6.0.3 / 7.0.2     | ✅ verified              | `tsc -p` on all three; `dist/index.js` emits `require`/`exports`                                                                          |

---

## 19. References

- [facebook-nodejs-business-sdk README](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/README.md)
- [capi-param-builder — NodeJS README](https://github.com/facebook/capi-param-builder/blob/main/nodejs/README.md)
- [Meta Business SDK Features for Conversions API](https://developers.facebook.com/documentation/ads-commerce/conversions-api/guides/business-sdk-features/)
- [Conversions API Server Event Parameters](https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/server-event/)
- [Conversions API Parameter Builder Library](https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameter-builder-library/)
- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
- [NestJS Dynamic Modules](https://docs.nestjs.com/fundamentals/dynamic-modules)
