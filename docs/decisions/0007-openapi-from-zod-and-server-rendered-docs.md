---
status: accepted
date: 2026-09-05
---

# 0007 OpenAPI generated from zod and documentation rendered on the server

## Context

Decision 0003 makes the contracts the source of validation and OpenAPI and names Swagger as the documentation UI. Two constraints shape how that is honoured. `packages/contracts` may only depend on zod, so an OpenAPI helper that wraps schemas in its own types would push a framework into ring 3. The transport policy in `apps/web/src/proxy.ts` allows scripts only from self with a per request nonce, so a documentation UI loaded from a CDN, or one that injects inline scripts, does not run.

## Decision

- The OpenAPI 3.1 document is built inside `apps/web/src/api/openapi/document.ts` from the contracts with `z.toJSONSchema`, which zod 4 ships. Route definitions add what a contract does not know: method, path, success status and where the input travels. Contract metadata becomes security requirements, documented headers and `x-` extensions. No OpenAPI library is added.
- `GET /api/docs` is a page rendered on the server from that document: no scripts, one nonce bound stylesheet, and its own `Content-Security-Policy: default-src 'none'`. It lists every operation with auth, human check, idempotency, rate limit bucket, parameters, request and response schemas and the error envelope, and links `openapi.json` for tooling.

## Consequences

- One code path feeds validation, documentation and, later, typed clients. A new contract appears in the documentation by adding a route definition.
- The page works under the strictest policy and carries no third party bundle, so the supply chain of the API surface stays the repository's own.
- Trying requests from the browser is not offered. Anyone who needs an interactive console loads `openapi.json` into the client of their choice. If an in-browser console becomes a requirement, a self hosted bundle served from `public/` under the nonce policy is the path, recorded as a new decision.
