# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Instead, use GitHub's private
vulnerability reporting (Repository → **Security** → **Report a vulnerability**). If that is
unavailable, contact the maintainer directly on GitHub ([@tanvir0604](https://github.com/tanvir0604)),
including:

- a description of the issue and its impact,
- the affected version(s),
- a minimal reproduction, if you have one.

We aim to acknowledge reports within a few business days and will coordinate a fix and a
disclosure timeline with you.

## Never commit Meta credentials

Access tokens and app secrets are the crown jewels. This package never logs them and never
ships them, and neither should your application:

- Keep tokens in environment variables or a secrets manager, and load them through NestJS
  config (`forRootAsync`), never hard-coded.
- Do not commit `.env` files. The repository `.gitignore` already excludes `.env` and `.env.*`.
- Rotate any token that may have been exposed.

## PII posture

Meta requires hashed customer information for good Event Match Quality, and it is easy to get
this wrong in a way that leaks data:

- **This package never hashes PII.** It passes raw values to Meta's official SDK, which
  normalizes and SHA-256 hashes them. Pre-hashing would double-hash and destroy match quality.
- **This package never logs raw PII.** The structured logger redacts secrets and raw
  email / phone / name values at the logger boundary, so a redaction cannot be forgotten at a
  call site.
- **Tokens are never included in error messages**, not even partially. Errors carry only
  non-sensitive context (dataset name, event name/id, `fbtrace_id`, HTTP status).

If you believe a code path leaks a token or raw PII, treat it as a security issue and report it
privately.

## Supported versions

The latest minor release receives security fixes. This package has not yet reached `1.0.0`;
until it does, only the latest published version is supported.
