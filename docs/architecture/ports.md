---
read-when: a use case needs something outside memory (database, email, files, payments, queue, clock, ids)
related: [dependency-rule, ../workflow/new-port, ../standards/testing]
---

# Ports

A port is an interface declared in `packages/application`, written in the vocabulary of the use case. It describes what the application needs, never how a provider does it.

Every port ships with four pieces, no exceptions:

1. The interface, in `packages/application/src/<component>/ports/`.
2. An in-memory implementation in `packages/infrastructure/src/memory/`, used by tests and by local development without services.
3. A real implementation in `packages/infrastructure/src/<provider>/`.
4. A contract test suite in `packages/infrastructure/test/contracts/` that runs the same assertions against the memory and the real implementation.

## Naming

Ports are named by capability: `DocumentStore`, `Mailer`, `PaymentGateway`, `JobQueue`, `Clock`, `IdGenerator`. Implementations are named by provider: `SupabaseDocumentStore`, `ResendMailer`, `StripePaymentGateway`, `PgmqJobQueue`.

## Rules

- A port receives and returns domain types or plain models. Never provider types.
- A port method does one thing. A repository port exposes one method per query the use cases actually run.
- Every repository port is tenant scoped. It cannot be constructed without a tenant context and it cannot query across tenants.
- Time and randomness are ports (`Clock`, `IdGenerator`) so use cases stay deterministic under test.
