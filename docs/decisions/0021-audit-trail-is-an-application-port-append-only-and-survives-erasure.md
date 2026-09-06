---
status: accepted
date: 2026-09-06
---

# 0021 The audit trail is a cross-cutting application port, append only at the database level, and it survives anonymization

## Context

Three things already exist that an audit trail is not. A log line (`Logger`) is rotated and lost; nothing requires it to survive, and `docs/standards/security.md` already forbids personal data in it. The outbox (`Outbox`) is operational history of domain events waiting to be published, scoped to how long publishing takes, not to compliance timeframes. Neither answers "who did what, to what, and when" in a form a tenant's compliance officer, or this project's own future auditor, can query months later with confidence nothing in it was altered.

## Decision

### Shape: a port, not a domain aggregate

`AuditTrail` (`packages/application/src/kernel/ports/audit-trail.ts`) sits next to `Logger` and `Outbox` as a cross-cutting kernel port, not as an aggregate in `packages/domain`. An audit entry has no invariants of its own to enforce beyond "every field is present": it does not transition through states, it does not raise domain events, and nothing in the domain layer needs to reason about it. Modelling it as an aggregate would mean giving it a repository, a factory method, and invariant tests for a record that is, structurally, exactly `StoredEvent` (outbox) or `LogLine` (logger) with a different set of fields: `tenantId`, `occurredAt`, `actorId`, `actorKind`, `action`, `resourceType`, `resourceId`.

Use cases call `auditScopedTo(tenantId).record(...)` explicitly, inside the same `unitOfWork.run` block where they already call `outbox.enqueue(...)` — `grantConsent`, `withdrawConsent`, `revokeApiKey` and `createTenant` do this in this change. This is deliberately not automatic: not every domain event is worth an audit line (many are read-adjacent or internal), and deciding that centrally from the event payload alone, without knowing which actor authorized the action, would need the event to carry actor identity it currently has no reason to carry. A future use case that should be audited adds the same one call the four above already show, reusing its own authorization action string (`grantConsentAction`, `manageApiKeysAction`, ...) as the audit `action`, so the vocabulary of "what was allowed" and "what was recorded" never drifts apart into two names for the same thing.

### Append only, enforced twice

`app_user` receives `GRANT SELECT, INSERT` on `audit_log`, no `UPDATE`, no `DELETE` — the first time a tenant table in this schema has ever had a narrower grant than `SELECT, INSERT, UPDATE` (every other table, including `consents`, keeps `UPDATE` because withdrawal is a real state change on an existing row; an audit entry never changes once written). That alone stops the application role, but not a migration run as a superuser, not a manual `psql` session against production, not a future grant someone adds without reading this file. `audit_log_immutable()` (`packages/infrastructure/migrations/0006_audit_log.sql`) is a `BEFORE UPDATE OR DELETE` trigger that raises unconditionally, regardless of role, so the guarantee is "this table cannot be changed by any means short of dropping the trigger," not "this table cannot be changed by the one role we remembered to restrict."

Row level security still applies: `audit_log_own_select` and `audit_log_own_insert` scope by `tenant_id = current_tenant_id()`, and `audit_log_platform_all` exists for the same registry-scoped writes `consents` and `outbox` already allow (a tenant is created inside a `{ kind: "registry" }` transaction; its first audit entry is written under that tenant's own scope by `auditScopedTo(tenant.id)`, which re-applies tenant scope for that one statement via the same reentrant `runScoped` every other repository already relies on — see `packages/infrastructure/src/postgres/transaction-context.ts`). There is intentionally no `audit_log_own_update` or `..._delete` policy: a policy that exists only to be always denied by the grant above it is a policy nobody will remember why it is there.

### Survives anonymization, on purpose

`AuditTrail` has no `AnonymizableSource` adapter, deliberately, for the same reason decision 0018 keeps `Consent` rows untouched by `eraseSubjectDataExecutor`: "who did what" needs a stable `actorId` to mean anything, and rewriting it to an anonymization token the moment the actor is erased would make every audit entry about that actor simultaneously unfalsifiable and useless — indistinguishable from an entry about any other erased actor. `actorId` stays classified `personal` wherever it is read (as `subjectId` already is on `Consent`), so it is still redacted from logs and still included in a subject's own data export; anonymization and redaction remain the two different mechanisms decision 0018 already keeps apart, and this file only concerns the first one.

## Consequences

- A derived project extends the audited action list by adding one `auditScopedTo(...).record(...)` call inside an existing use case's transaction; nothing about the port changes.
- `ListAuditEntries` (`packages/application/src/audit/list-audit-entries.ts`) exists and is authorized the same way `hasActiveConsent` is (a free-standing `audit:read` action, not in `packages/domain/src/identity/role.ts`'s role matrix, checked against `actor.scopes` for non-user actors exactly like every other privacy-adjacent action in this wave) and is wired in `apps/web/src/main/use-cases.ts` as `listAuditEntriesOperation`. No HTTP route exposes it yet — that is a contract, a controller and a route definition, not a decision, and was left out of this change under its time box; the use case is ready for whoever adds it.
- Nothing in `packages/application/src/privacy` treats `AuditTrail` as a `SubjectDataSource` either; a subject's own access/export request today does not include audit entries naming them as an actor. Wiring that is the same shape of work `Consent` already went through and is flagged here, not silently skipped, for the same reason decision 0018 flags `Document` not being wired into erasure.
