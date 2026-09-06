---
status: accepted
date: 2026-09-06
---

# 0024 Field encryption keys become mandatory the moment real persistence is configured, independent of any module

## Context

`requiredInProduction` used to demand `FIELD_ENCRYPTION_KEYS` in every production deployment, regardless of whether `DATABASE_URL` was set. That coupling was backwards: the in-memory persistence this repository falls back to when no database is configured (`packages/infrastructure/src/memory`) never writes a row anywhere, so there is nothing for `FIELD_ENCRYPTION_KEYS` to protect while it is in use. Requiring the key in that case bought nothing and was exactly the kind of blanket requirement decision 0023 removes.

The real constraint runs the other way. `packages/infrastructure/src/postgres` writes rows that survive the process, and some of those rows carry fields classified `sensitive` in `packages/domain` (see `docs/standards/data-and-gdpr.md` and the `classify(...)` calls next to each aggregate). `AesGcmFieldCipher` exists precisely to encrypt those fields before they reach Postgres. `fieldCipherFor` in both `apps/web/src/main/container.ts` and `apps/worker/src/main/container.ts` already refuses to fall back to a silent no-op cipher: it either builds `AesGcmFieldCipher` from `FIELD_ENCRYPTION_KEYS`, or throws unless the caller has explicitly opted into an ephemeral, restart-losing key via `ALLOW_EPHEMERAL_FIELD_ENCRYPTION_KEY`. What was missing was surfacing that same constraint at the configuration-validation boundary (`env.ts`'s `superRefine`), where every other cross-field rule already lives, instead of only inside the container factory where it fires later and with a less specific message.

## Decision

`env.ts` in both `apps/web/src/main` and `apps/worker/src/main` adds one rule, independent of `architecture/modules.json`: if `DATABASE_URL` is set, `FIELD_ENCRYPTION_KEYS` must be set too, or the process refuses to start with a message naming `FIELD_ENCRYPTION_KEYS` explicitly. This is not a per-module rule — it does not belong to `documents`, `identity`, or any single business module, because sensitive fields exist across more than one of them (a document's extracted text, a user's identity fields, a consent's source IP). It is a property of *persistence being real*, so it is checked once, next to the schema, the same place the `SUPABASE_URL`/`SUPABASE_ANON_KEY` and `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` pairing checks live.

No variable in this repository is required simply because `NODE_ENV=production`. `DATABASE_URL` itself stays fully optional even in production: a derived project may legitimately run production on the in-memory store during an early rollout (data does not survive a restart, which is a choice the derived project's operator makes, not one this repository enforces). What is not optional is the *combination* of "data persists for real" and "sensitive fields are stored in the clear." That combination is a fixed decision, not a knob: `ALLOW_EPHEMERAL_FIELD_ENCRYPTION_KEY` remains the only sanctioned way to run real persistence without a durable key, and it is deliberately named to read as unsafe, exactly as decision 0014 named its own escape hatch to read as unsafe.

## Consequences

- Setting only `DATABASE_URL`, without `FIELD_ENCRYPTION_KEYS`, now fails at `env.ts` parse time, in both apps, with a message that names `FIELD_ENCRYPTION_KEYS` and explains why: the same failure the container already produced one layer later, now caught earlier and worded the same way `docs/decisions/0019` already describes the key format.
- A deployment with no `DATABASE_URL` at all needs no field encryption configuration whatsoever — this is the case the whole-repository acceptance test ("starts and works with zero environment variables") exercises, and it remains true after this change.
- This rule does not appear in `architecture/modules.json` and never will: it is a persistence-level invariant, not a module a project could reasonably want to switch off while keeping real Postgres.
