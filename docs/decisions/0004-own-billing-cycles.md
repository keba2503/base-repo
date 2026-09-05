---
status: accepted
date: 2026-09-05
---

# 0004 Billing cycles are ours, not the provider's

## Context

Stripe Billing manages subscriptions, proration and invoices. Redsys and most regional providers only charge cards, sometimes with a stored token. A base that promises provider swap by changing one adapter cannot delegate billing logic to a provider.

## Decision

Payments, refunds, subscriptions, cycles and invoices are domain entities and use cases driven by the job queue. The payment port has two verbs: start a payment, returning a redirect or a signed form for the view; interpret a provider notification, returning a normalised event. Stripe is the reference adapter.

## Consequences

- Swapping Stripe for Redsys touches `packages/infrastructure` only.
- More code up front for renewals and invoices.
- Idempotency of provider notifications is handled by us, keyed by provider event id.
