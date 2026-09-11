---
status: accepted
date: 2026-09-11
---

# 0034 The privacy source ports take their tenant per call, and that is the exception to the tenant scoped rule

## Context

`docs/architecture/ports.md` states that every repository port is tenant scoped: it cannot be constructed without a tenant context and it cannot query across tenants. The three privacy ports added for the erasure, export and retention jobs (`AnonymizableSource`, `SubjectDataSource`, `RetainableSource`) take the `tenantId` as a parameter of each method instead, and their implementations resolve the scope per call.

The reason is where they run. Their callers are job executors, and a job carries its tenant on the job, not on the executor: one `eraseSubjectDataExecutor` instance is mounted once at the composition root and then runs for whichever tenant's job the queue claims next. A port constructed with a fixed tenant cannot serve that shape — the composition root would have to build a source per tenant it does not know in advance. The review flagged the divergence correctly; this record makes it a decision rather than an oversight.

## Decision

The three privacy source ports keep `tenantId` as a method parameter. Their implementations enforce the boundary the rule exists for in another way: every query goes through the same tenant scope mechanism the tenant-scoped repositories use (`runScoped` with `{ kind: "tenant", tenantId }` in Postgres, an explicit tenant check in memory), so a call can only ever touch the tenant it was given, and the contract suite asserts that a call for another tenant finds nothing and anonymizes nothing.

## Consequences

The rule in `ports.md` now has one documented exception, and the exception is narrow: it applies to ports whose callers are job executors carrying a tenant per job, not to repository ports built by a use case. A future port that takes a tenant per call without that caller shape is still a violation. The risk this leaves open is that the tenant check lives in each implementation rather than in construction; the contract suite covers it for the memory implementation, and the Postgres side is covered by the same scope mechanism as every other repository but not yet exercised against a real database, which `docs/defects/DEF-0024` records.