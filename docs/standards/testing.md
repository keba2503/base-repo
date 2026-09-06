---
read-when: writing or reviewing tests, adding a port, touching CI
related: [../workflow/new-port, ../architecture/ports, ../workflow/quality-gates]
---

# Testing

Tests are the outermost ring. They depend on everything; nothing depends on them.

## Kinds and where they live

| Kind | Lives in | Runs against | Runner |
| --- | --- | --- | --- |
| Domain | `packages/domain/test` | entities and value objects | bun test |
| Use case | `packages/application/test` | use cases with memory ports | bun test |
| Presenter and controller | `packages/adapters/test` | pure functions | bun test |
| Contract | `packages/infrastructure/test/contracts` | every port, memory and real | bun test |
| End to end | `apps/web/e2e` | the running application | Playwright |
| Load | `scripts/load` | preview deployments | k6 |

## Rules

- A use case test never touches a database, a network or the file system.
- Test names describe behaviour: `rejects an order without lines`, not `test1`.
- One assertion subject per test. Several assertions about the same subject are fine.
- Fixtures are built through factories in `test/factories`, never copied literals.
- Contract suites are the specification of a port. A real implementation that fails them is wrong, not the suite.
- Structural coupling is avoided: tests call public entry points, never internals.

## Load

`scripts/load` holds k6 scripts, one file per scenario, run manually against a preview deployment, never against production and never from CI:

```
K6_BASE_URL=https://<preview>.vercel.app K6_API_KEYS=key1,key2,key3 k6 run scripts/load/read-heavy.js
K6_BASE_URL=https://<preview>.vercel.app K6_API_KEYS=key1,key2,key3 k6 run scripts/load/document-upload.js
```

- `read-heavy.js` exercises `GET /v1/tenants/{slug}`, `GET /v1/documents` and, when `K6_DOCUMENT_ID` is set, `GET /v1/documents/{documentId}`: the three `either`-auth read operations that exist today.
- `document-upload.js` exercises `POST /v1/documents/upload-urls`, the one `either`-auth write operation that does not depend on a prior state a script would have to fabricate.
- `createTenant`, `createApiKey` and `revokeApiKey` require a `session` credential (a real Supabase Auth login), not an api key, so they are not scripted here: a headless load generator cannot obtain one without also standing up and rotating a seeded test user, which is a decision for whoever runs this against their own preview environment, not something to fake with a fixture. `confirmDocumentUpload` is skipped for the same shape of reason: it depends on a real object having been uploaded to the signed URL `createDocumentUpload` returned, an external round trip a load script should not simulate.
- Each virtual user authenticates with its own api key from `K6_API_KEYS` (a comma separated list, one secret per expected virtual user) precisely so the rate limiter in `docs/standards/security.md` is exercised as a per credential bucket, the way it runs in production, rather than one shared key tripping `429`s that would say nothing about the backend's real capacity. Pick a virtual user count and sleep interval that stays under the bucket size in `defaultRateLimits` (`apps/web/src/api/dependencies.ts`) for the operation being scripted; going over it on purpose is a rate limiter test, not a load test, and belongs in `packages/infrastructure/test`, not here.
- A run is red when `http_req_failed` crosses its threshold (more than 1% of requests failing) or `http_req_duration` misses its `p(95)`/`p(99)` target declared in each script's `options.thresholds`. k6 exits non-zero on either, so a CI step could gate on it without reading the summary by hand; nothing here wires that gate today.
