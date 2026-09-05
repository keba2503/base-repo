---
read-when: editing anything under packages/contracts, or exposing an operation to the API
related: [adapters, ../architecture/boundaries, ../standards/security]
---

# Contracts rules

Ring 3. Depends on `@base/domain` for shared enums only. External: zod.

A contract is the public shape of one operation: input schema, output schema, error codes and metadata. It is the single source for validation, OpenAPI generation and typed clients.

## Metadata every contract declares

- `auth`: `session`, `apiKey`, `either` or `public`.
- `humanCheck`: whether a captcha proof is required.
- `idempotent`: whether writes accept an idempotency key.
- `rateLimit`: bucket name.

Delivery mechanisms read this metadata. A controller never decides these things.

## Rules

- Contracts do not import from application or adapters.
- Versioned by folder: `v1/`. A breaking change is a new version, never an edit.
- Output schemas are allow lists. Adding a field is a deliberate act.
