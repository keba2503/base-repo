---
status: accepted
date: 2026-09-05
---

# 0008 Idempotency and rate limit stores start in memory

## Context

The external API enforces the `idempotent` and `rateLimit` contract metadata through two ports, `IdempotencyStore` and `RateLimiter`. Every port ships with a real implementation, and the real home for both is a store shared by every instance: Postgres for idempotency records, Redis or Postgres for rate limit windows. Neither is provisioned yet; decision 0002 fixes Postgres through Drizzle as the database, and its schema and migrations do not exist at the time of writing.

## Decision

- `InMemoryIdempotencyStore` and `SlidingWindowRateLimiter` are complete implementations with contract suites, not stubs. They are what `development` and `test` wire.
- The contract suites are the specification the shared implementations must satisfy when Postgres arrives: `describeIdempotencyStoreContract` and `describeRateLimiterContract` take a harness with a controllable clock so a Postgres or Redis implementation can prove expiry and sliding windows without waiting in real time.
- `HumanVerifier` does not wait: `TurnstileHumanVerifier` is the real implementation, gated in tests on `TURNSTILE_SECRET`.

## Consequences

- With more than one serverless instance the memory implementations are per instance: a replayed request may reach an instance that never saw the key, and rate limits are counted per instance. Acceptable for development and for a single instance; not acceptable for production, which must wire the shared implementations before exposing writes.
- The API code does not change when the shared implementations land; only `apps/web/src/main` does.
