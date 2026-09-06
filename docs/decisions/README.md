---
read-when: making a tradeoff, or wondering why something is the way it is
related: [../architecture/dependency-rule]
---

# Decision records

One file per decision, numbered, never edited after acceptance. A reversal is a new record that supersedes the old one.

| Number | Title | Status |
| --- | --- | --- |
| 0001 | Clean Architecture as a bun monorepo | accepted |
| 0002 | Postgres through Drizzle, not supabase-js | accepted |
| 0003 | External API with Hono inside Next.js | accepted |
| 0004 | Billing cycles are ours, not the provider's | accepted |
| 0005 | No comments in code | accepted |
| 0006 | Multi-tenant from the first entity | accepted |
| 0007 | Row level security keyed on a transaction local setting | accepted |
| 0008 | Identity resolution and api keys | accepted |
| 0009 | OpenAPI generated from zod and documentation rendered on the server | accepted |
| 0010 | Idempotency and rate limit stores start in memory | accepted |
| 0011 | Provider failures are unavailable domain errors | accepted |
| 0012 | Configuration is validated at runtime, not at build | accepted |
| 0013 | The remote address trusts the platform header first | accepted |
| 0014 | The development actor requires its own flag, not just NODE_ENV | accepted |
| 0015 | A deferred job queue is its own table, not pgmq | accepted |
| 0016 | A document is uploaded directly to storage, never through the API body | accepted |
| 0017 | Consent categories exclude what is strictly necessary, and coverage is checked against the policy version | accepted |
| 0018 | The right to erasure anonymizes in place; it never deletes a row | accepted |
| 0019 | Field-level encryption keys are rotated by keeping old ones, not by re-encrypting | accepted |
| 0020 | Telemetry traces one span per HTTP request and one per job execution, never per database query | accepted |
| 0021 | The audit trail is a cross-cutting application port, append only at the database level, and it survives anonymization | accepted |
| 0022 | Analytics loads under the existing strict-dynamic policy, and server events never let the browser talk to the provider | accepted |
| 0023 | Module activation is a static file next to the layer graph, never a runtime flag checked with if | accepted |
| 0024 | Field encryption keys become mandatory the moment real persistence is configured, independent of any module | accepted |
| 0025 | A variable that belongs to no module is still required in production if its absence is unsafe, and a gate now proves nothing else falls through | accepted |
| 0026 | An active optional module requires its real provider in production, with no middle state, and architecture/ is now a layer nothing but src/main may read | accepted |
| 0027 | Component source is copied by hand from official documentation, never through an unpinned CLI | accepted |

## Template

```
---
status: proposed | accepted | superseded by NNNN
date: YYYY-MM-DD
---

# NNNN Title

## Context
## Decision
## Consequences
```
