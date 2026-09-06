---
status: accepted
date: 2026-09-06
---

# 0025 A variable that belongs to no module is still required in production if its absence is unsafe, and a gate now proves nothing else falls through

## Context

Decision 0023 replaced `requiredInProduction`, a flat list of nine variables, with per-module rules validated in `env.ts`'s `superRefine`. Reviewing that change caught a real regression, not a hypothetical one: three variables that belong to no business module — `API_KEY_PEPPER`, `SENTRY_DSN`, `TURNSTILE_SECRET` — were in the old list and ended up in neither `moduleEnvVariables` nor any `superRefine` rule. They fell through the gap between "no longer in the old list" and "nobody wrote the new rule for it," and nothing caught it.

The consequence was worst for `API_KEY_PEPPER`. Without it, `identityParts` in both `apps/web/src/main/container.ts` falls back to `InMemoryApiKeyHasher` (`packages/infrastructure/src/memory/identity/api-key-hasher.ts`), an unsalted 64-bit FNV-1a hash built for tests. A production deployment with a real database configured would issue and validate api keys normally while persisting them hashed in a way trivially reversible by brute force — a real credential-at-rest failure with no symptom at all, not even a boot warning, while far less serious gaps (Resend, Sentry, analytics) already warned.

`SENTRY_DSN` had already been made required in production once, in `4da40e6`, with its own reasoning ("every request and job keeps answering while nothing is exported, with only a boot warning as the symptom") and `TURNSTILE_SECRET` was required for the identical shape of reason before decision 0023 touched the file. Decision 0023's per-module reorganization silently reverted both, because neither is owned by an optional module and the rewrite only thought in terms of modules.

## Decision

### These three are required in production, unconditionally, restored with their original reasoning

`API_KEY_PEPPER`, `SENTRY_DSN` and `TURNSTILE_SECRET` go back to failing boot in production when absent, in both `env.ts` files where applicable (`TURNSTILE_SECRET` and `API_KEY_PEPPER` are web-only; `SENTRY_DSN` is required in both apps). None of the three is conditioned on `architecture/modules.json`: `API_KEY_PEPPER` and `TURNSTILE_SECRET` are placed under the `identity` group in `moduleEnvVariables` because they protect a core module that is never inactive, not because their requirement depends on a flag; `SENTRY_DSN` goes under a new `observability` group, because it protects request and job tracing across every module, owned by none of them specifically.

### `DATABASE_URL` stays legitimately optional, but now says so

Running production without `DATABASE_URL` (in-memory persistence, data lost on every restart) remains a choice a derived project is allowed to make — decision 0024 already established that requiring it unconditionally would contradict "starts with zero environment variables." What was missing was any visible signal that the choice was made: `createContainer` in both `apps/web/src/main/container.ts` and `apps/worker/src/main/container.ts` now logs a warning when `NODE_ENV=production` and no `DATABASE_URL` is configured, the same pattern already used for `SENTRY_DSN`, `RESEND_API_KEY` and analytics absence. `DATABASE_URL` needed no new `superRefine` rule to satisfy the gate below — it was already referenced there through its coupling with `FIELD_ENCRYPTION_KEYS` (decision 0024) — but it still lacked the operator-facing signal, which is a separate concern from schema validation.

### The gate that would have caught this the first time

`bun run env-example` checked that every variable a module *declares* is documented in `.env.example`. That is a check against what someone remembered to write down, not against what the schema actually contains — exactly the shape of check that a variable can silently fall outside of. `scripts/architecture/check-env-completeness.ts` adds the check that actually closes the gap: parse each `env.ts`'s zod schema, collect every field marked `.optional()` (a field with only `.default(...)` is never actually absent, so it needs no rule), collect every field referenced anywhere inside the `.superRefine` callback (a rule, conditional or not, "governs" it), and collect every field named in a new `intentionallyOptionalEnvVariables` list (an explicit, cheap declaration that no rule is coming on purpose — `RESEND_API_KEY`, and on the web side `GTM_CONTAINER_ID`, `GA_MEASUREMENT_ID`, `GA_API_SECRET`, all of which already degrade gracefully with a runtime warning and have no security consequence when absent). A field that is optional in the schema, referenced by no rule, and named in no opt-out list fails the gate by name, naming the actual environment variable, not just the camelCase property.

This is a stronger claim than "documented in `.env.example`": it is checked before that step now, in the same `bun run env-example` command, and it answers "is there a reason this can be silently absent" rather than "did someone remember to write a line in a text file."

## Consequences

- Every currently optional field in both `env.ts` files is now either governed by a rule or named in `intentionallyOptionalEnvVariables`; `scripts/architecture/check-env-completeness.test.ts` and a manual regression check (temporarily removing the `API_KEY_PEPPER` rule and re-running `bun run env-example`) both confirm the gate reports exactly the variable that would otherwise fall through.
- Declaring a new optional configuration variable now requires one of two things in the same change: a `superRefine` rule, conditional or not, or an entry in `intentionallyOptionalEnvVariables` with a reason the reviewer can see is deliberate. Skipping both fails `bun run env-example`, the same gate `bun run check` already runs.
- Variables reviewed against this same criterion beyond the three found here: every field in both schemas was walked by hand once more after writing the gate (see the audit in the report for this change) — none of the remaining optional fields (`DATABASE_URL`, the Supabase pairs, `FIELD_ENCRYPTION_KEYS`) needed a new rule; they were already governed through decision 0023 and 0024's existing checks.
