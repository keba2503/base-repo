---
status: accepted
date: 2026-09-05
---

# 0011 Provider failures are unavailable domain errors

## Context

Ports that reach a provider, such as `Mailer`, return `Result<void, DomainError>` so that use cases and event handlers stay free of exceptions. The kernel only knew four error kinds: `invariantViolation`, `notFound`, `conflict` and `forbidden`. None of them describes a provider that timed out, refused the credentials or answered with a server error. Forcing those failures into `conflict` would lie to the caller and to the delivery mechanism that maps kinds to status codes.

## Decision

Add the kind `unavailable` to `DomainError`, with the constructor `unavailable(code, message)`. Infrastructure translates provider outages, timeouts, rate limits and credential failures to it at the boundary. Message shape problems that the provider reports, such as a malformed recipient, remain `invariantViolation`. Adapters map `unavailable` to an outcome of the same name so delivery mechanisms can answer with a retryable status.

## Consequences

- The outbox dispatcher treats an `unavailable` failure like any other: the event is marked failed and retried on the next poll.
- The `Outcome` union in adapters gains the `unavailable` member; presenters that switch over outcome kinds must handle it.
- A provider message never travels inside the domain error message; only the provider error name does. The full message stays in logs.
