---
date: 2026-09-06
status: superseded by 0033
---

# 0018 The right to erasure anonymizes in place; it never deletes a row

## Context

`docs/standards/data-and-gdpr.md` already commits this repository to two structural facts that make row deletion the wrong tool for GDPR erasure: `app_user` has no `DELETE` grant on any tenant table by design (`docs/layers/infrastructure.md`, decision 0007's spirit extended: an application role that can empty its own tables is a worse failure mode than the alternative), and some records that reference a person must legally or operationally survive that person's erasure request — accounting records, the audit trail of consent itself (`Consent.withdraw` keeps `grantedAt`, see the consent aggregate), and outbox/job history that other tenants' data integrity does not care about but compliance investigations might.

Deletion also does not compose the way anonymization does. A `Document.uploadedBy` or a `Membership.userId` pointing at a row that no longer exists is either a dangling foreign key or a null that the rest of the codebase now has to treat as a distinct, untested case everywhere it appears. A `User` whose email and display name have been overwritten with an opaque token, while its id stays exactly where it was, breaks nothing downstream: every join, every membership, every prior document upload still resolves.

## Decision

Erasure is `User.anonymize({ at, token })`: it replaces `email` with `${token}@erased.invalid` and `displayName` with `token`, keeps `id`, `tenantId` and `createdAt` untouched, and records a `user.anonymized` domain event. The application layer's `requestErasure` use case (`packages/application/src/privacy/request-erasure.ts`) does not anonymize synchronously in the request — it enqueues `privacy.erasure.subject` on the job queue built in wave 1, because walking every source that might hold a reference to a subject is exactly the kind of unbounded, potentially slow fan-out the job queue exists for (`packages/application/src/jobs`). The job executor (`packages/application/src/privacy/jobs/erase-subject-data.ts`) is generic: it takes a list of `AnonymizableSource` (`sourceName`, `anonymize(tenantId, subjectId, token, at)`) and calls each one with the same token, so every source's copy of the subject becomes unreadable under the same, correlatable-only-with-the-job opaque value, never the original personal data.

The token is `erased-${subjectId}` (`anonymizationTokenFor` in the same file) — deterministic, not a secret, and deliberately not cryptographically hidden: it does not need to be, because it identifies which erasure job touched a row, not who the person was. What must never survive is the original email and display name, and those are fully overwritten.

What survives untouched, and why:

- **`Consent` rows are never anonymized or deleted by this job.** They are the proof that consent was given and, where applicable, withdrawn — `docs/standards/data-and-gdpr.md`'s own words: "retirar no borra el registro". A `Consent.subjectId` pointing at a now-anonymized `User` is acceptable and expected; the consent record's evidentiary value depends on it staying linked to a stable id, not on being scrubbed alongside the person's profile. `subjectId` is classified `personal` on `Consent` (see `consentFieldClassifications`), so it is still redacted from logs and included in an access/export request like any other personal field — anonymization and log redaction are different concerns solved by different mechanisms in this repository, and this decision only concerns the former.
- **Outbox and job queue history are never touched.** They are operational record of what the system did, not a profile about the person, and rewriting history there would break `docs/decisions/0015-own-job-queue-table-not-pgmq.md`'s "one file, one clear machine" property for no compliance benefit.
- **`Document` is not wired into erasure in this wave.** Only `User` has a concrete `AnonymizableSource` implementation; `Document.uploadedBy` and `Document.extractedText` are exactly the kind of second source a real deployment will want anonymized too (clearing `extractedText`, replacing `originalFilename`), but adding it is mechanical repetition of the same pattern already proven for `User`, not a new decision, and was left out under this wave's time box. `packages/application/src/privacy/ports/anonymizable-source.ts` is the extension point; a derived project adds one adapter per aggregate that holds personal data about a subject who can request erasure.

## Consequences

- No repository in this codebase needed a new `DELETE` grant, and none should ever get one for a tenant table (0007's isolation argument holds for GDPR erasure exactly as it does for accidental data loss).
- A subject can be "erased" and still show up correctly in every list, join, and permission check that references their id — because the id was never the personal data, the email and the name were.
- Retention (decision to follow, `0019` covers the key, this same job shape covers retention: `retentionSweepExecutor` calls the identical `anonymize` contract on a schedule instead of on request) reuses this exact mechanism instead of inventing a second one, so "anonymize a subject" has exactly one implementation per source, used by both the on-demand right and the scheduled sweep.

## Known gap: nothing seeds the first retention sweep

`retentionSweepExecutor` reschedules itself once it runs (it enqueues its own next `privacy.retention.sweep` job with a future `runAt`), but nothing yet enqueues the *first* one for a tenant. A retention policy that is never triggered is worse than having none: it gives the appearance of compliance without the fact of it. Whatever wires `retentionSweepExecutor` into a container must also enqueue the first `privacy.retention.sweep` job per tenant — the natural place is alongside `createTenant`, the same way `confirmDocumentUpload` enqueues `documents.process` the moment there is something for a job to act on — before this is considered done, not as an afterthought once someone notices retention silently never ran.
