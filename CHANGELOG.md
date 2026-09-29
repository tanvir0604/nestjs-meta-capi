# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `MetaCapiModule.forRoot()` and `MetaCapiModule.forRootAsync()` with fail-fast configuration
  validation and a globally-registered, metadata-gated interceptor.
- `@MetaEvent()` and `@MetaDataset()` decorators — metadata only, no I/O at decoration time.
- `MetaCapiService.track()` for programmatic use (works outside an HTTP context) and
  `getClient()` as the documented SDK escape hatch.
- Multi-dataset resolution with precedence `@MetaEvent({ dataset })` → method `@MetaDataset` →
  controller `@MetaDataset` → configured default.
- Event building with the `event_time` and `action_source` defaults the SDK does not supply,
  raw user-data pass-through (no pre-hashing), and camelCase → snake_case custom-data mapping.
- Request-context extraction (fbc / fbp / client IP / event source URL) via
  `capi-param-builder-nodejs`, plus `client_user_agent` read from the request headers.
- Delivery modes (`async` default, `sync`), exponential backoff with jitter, retry
  classification, and body-aware success detection.
- Redacting structured logger; tokens and raw PII never reach a log sink.
- Opt-in first-party cookie write-back for `_fbc` / `_fbp` (`cookies: { enabled: true }`).
- Dual ESM + CJS build with matching type declarations.
- Express and Fastify integration tests.
- A compile-checked example app under `examples/basic`.

[Unreleased]: https://github.com/tanvir0604/nestjs-meta-capi/commits/main
