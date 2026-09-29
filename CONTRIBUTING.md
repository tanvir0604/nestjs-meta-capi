# Contributing

Thanks for helping improve `nestjs-meta-capi`. This project ships to strangers, so the bar is
"a maintainer trusts this in production". Please read this file before opening a pull request.

## Getting set up

```bash
git clone https://github.com/tanvir0604/nestjs-meta-capi.git
cd nestjs-meta-capi
npm ci --include=dev
```

> **Note.** If your environment sets `NODE_ENV=production`, npm's default `omit=dev` silently
> skips devDependencies. Always install with `--include=dev` locally.

## The validation chain

Every change must pass the full chain, which is exactly what CI runs:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:cov
npm run build
npm run pack:check
```

Or run them all at once:

```bash
npm run release
```

Coverage thresholds (90% lines / branches / statements / functions) are enforced by Jest. A PR
that drops coverage below the bar fails CI.

### Useful commands

```bash
npm run format       # Prettier write
npm test             # Jest (watch-free)
npm run test:cov     # Jest with coverage
npm run test:live    # live-credential tests (opt-in, never run on PRs)
```

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`,
  `docs:`, `test:`, `refactor:`, `chore:`, `ci:`, `build:`. CI enforces the format.
- **Branches:** `main` is protected and releasable. Use short-lived `feat/…` and `fix/…`
  branches.
- **Code:** follow the existing patterns, keep the public API small, and comment only where the
  intent is non-obvious. No `console.log` (lint-enforced), no unused variables, and consistent
  import ordering. `any` requires an inline justification comment.
- **Tests:** new behaviour needs tests. Invariants that matter (never send on handler failure,
  never log a token, never double-hash PII) must have an explicit test.

## The invariants

These are non-negotiable; see `SPEC.md` for the full list. In short:

1. All Meta API interaction goes through the official SDK, behind the adapter.
2. Decorators attach metadata only — never perform I/O.
3. Events fire only after a successful handler; a thrown exception propagates unchanged.
4. In `async` mode a Meta delivery failure must never fail the business request.
5. Never double-hash PII, and never log secrets or raw PII.

## Documentation

`SPEC.md` is the single authoritative specification. If your change alters behaviour, update it in
the same commit — it is the source of truth for reviewers and contributors.

## Live tests

Live tests hit the real Meta API and are gated behind credentials. They are **never** run on
pull requests. To run them locally:

```bash
META_LIVE_TEST=true META_LIVE_DATASET_ID=... META_LIVE_ACCESS_TOKEN=... npm run test:live
```

Never commit credentials, and never paste tokens or raw PII into an issue or PR.
