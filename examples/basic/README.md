# Basic example

A minimal NestJS app showing the common case: a module configured with
`forRootAsync`, a controller decorated with `@MetaDataset` + `@MetaEvent`, and a
service that also calls `track()` programmatically.

This example is compile-checked in CI (`npm run typecheck`), so it cannot drift
from the public API.

## Running it

```bash
export META_DATASET_ID=your_pixel_id
export META_ACCESS_TOKEN=your_access_token

npx tsx src/main.ts
```

Then, in a second terminal:

```bash
curl -X POST http://localhost:3000/leads \
  -H 'content-type: application/json' \
  -H 'user-agent: curl-example' \
  -d '{"email":"joe@example.com"}'
```

After the handler resolves, a `Lead` event is sent to Meta, and the `_fbp`
cookie is written back to the response (because `cookies.enabled` is `true`).

> **Never** commit real access tokens. Load them from environment variables or a
> secrets manager, as this example does.
