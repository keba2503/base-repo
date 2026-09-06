---
status: accepted
date: 2026-09-06
---

# 0020 Telemetry traces one span per HTTP request and one per job execution, never per database query

## Context

`ESTRUCTURA.md` already named where this would go before any code existed: a `Telemetry` port in `packages/application/src/kernel/ports`, a real exporter in `packages/infrastructure/src/otel`. Two questions had to be settled before writing either: what unit of work gets a span, and how a span carries `tenantId`, `actorId` and `requestId` without carrying the personal data `docs/standards/data-and-gdpr.md` and `docs/standards/security.md` both forbid sending to an external service.

## Decision

### What gets a span

A span opens once per HTTP request, in `routeHandler` (`apps/web/src/api/route-handler.ts`), wrapping rate limiting, authentication, the human check, idempotency and the use case call as one unit — the same boundary `requestId` already exists for. A span also opens once per job execution, in `dispatchJobs`'s `settle` (`packages/application/src/jobs/dispatch-jobs.ts`), because a job runs outside any request and would otherwise be invisible between the log line it emits on failure and the outbox/job table it mutates.

Nothing traces a database query, a repository method or a use case on its own. A repository call inside a request is already inside that request's span; a second, nested span per statement multiplies the volume exported by however many `SELECT`s and `INSERT`s a use case happens to run, for no question it answers that the request span does not already answer approximately as well (was this request slow, did it fail, for which tenant). Query-level detail belongs to Postgres's own slow query log and, if a project outgrows this, to automatic instrumentation of the driver at the OTel SDK layer — not to hand-written spans scattered through every repository, which is exactly the `packages/infrastructure` no-comments-in-spirit problem: information that belongs in one place duplicated badly in twenty.

### What a span carries, and how it stays clean

`Span.setAttribute` takes whatever the caller passes: `tenantId`, `subjectId` (from `Actor`), `requestId`, `operationId`, `jobId`, `jobName`. Nothing filters this at the call site. Instead, `OtelTelemetry` (`packages/infrastructure/src/otel/telemetry.ts`) and `InMemoryTelemetry` (`packages/infrastructure/src/memory/telemetry.ts`) both redact every attribute through the exact same `redact`/`RedactionPolicy` that `ConsoleLogger` already uses (`packages/infrastructure/src/memory/logger.ts`), keyed by field name. `subjectId` is classified `personal` everywhere it appears (`consentFieldClassifications`, now folded into `apps/web/src/main/container.ts`'s `logRedactionPolicy`, which was missing it before this change — a real gap, not a new rule), so it always exports as `redactedMarker`, while `tenantId`, `requestId`, `jobId` and `jobName` are classified `none` and pass through, because they are the fields that make a trace searchable. This is the same reason decision 0017 gives for treating consent's `subjectId` as personal even though it is only ever an opaque identifier: a field name is either classified once, correctly, and every consumer (log, span, export) inherits the same answer, or it is re-decided ad hoc at each call site and someone eventually gets it wrong.

### Exporting without a vendor SDK

The real implementation uses `@opentelemetry/api` and `@opentelemetry/sdk-trace-node` directly, not `@sentry/node`. `@sentry/node` ships `import-in-the-middle` module patching and auto-instrumentation that install themselves process-wide the moment the package is required — exactly the kind of implicit, undeclared tracing this decision argues against (span boundaries should be the two named above, chosen on purpose, not whatever a vendor's auto-instrumentation decides to wrap). `sentryOtlpEndpointFrom` (`packages/infrastructure/src/otel/sentry-endpoint.ts`) is a small pure function that turns a Sentry DSN into the OTLP traces endpoint and `x-sentry-auth` header Sentry's own OTLP ingestion documents (`https://<host>/api/<project>/otlp/v1/traces`), so the only Sentry-specific code in this repository is deriving a URL and a header from a DSN already meant to be public-ish (it is sent to the browser in Sentry's own client SDK). `@opentelemetry/exporter-trace-otlp-http` does the actual sending; swapping Sentry for any other OTLP-compatible backend is one function.

### Wiring

`SENTRY_DSN` is in `requiredInProduction` in both `apps/web/src/main/env.ts` and `apps/worker/src/main/env.ts`, the same list `TURNSTILE_SECRET` is already in (decision 0014's neighbourhood): a production boot without it does not fail loudly at the one operation it disables, the way a missing `RESEND_API_KEY` fails a specific email send. It fails silently at everything else — every request and every job keeps answering normally, and the only symptom is a warning line at boot nobody is watching. `TURNSTILE_SECRET` was already treated this way for exactly that reason; tracing being invisible-by-absence in the same way, and arguably worse (it is supposed to be the thing that tells you something else broke), is not a case for a softer rule. Outside production it stays optional: `test` gets `InMemoryTelemetry`, and `development` without a DSN gets `NoopTelemetry` with a boot warning, both legitimate — a developer without a Sentry project is not the failure this decision guards against.

## Consequences

- A trace answers "which tenant, which operation, how long, did it fail" for every request and every job, at a cost proportional to traffic, not to schema complexity.
- Adding a third traced boundary later (say, outbound provider calls in `packages/infrastructure`) is a decision to write here, not a default to slide into because the port already exists.
- `logRedactionPolicy` in `apps/web/src/main/container.ts` now includes `consentFieldClassifications`; this also fixes an existing gap where a log line naming `subjectId` was never redacted before this change, because no repository read that classification map into the console logger's policy.
