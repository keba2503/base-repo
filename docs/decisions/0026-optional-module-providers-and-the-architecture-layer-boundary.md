---
status: accepted
date: 2026-09-06
---

# 0026 An active optional module requires its real provider in production, with no middle state, and `architecture/` is now a layer nothing but `src/main` may read

## Context

A second, independent review of decision 0023 found two more problems the first review and this repository's own gates had not caught.

First: `mailerFor` fell back to `ConsoleMailer` with only a warning when `RESEND_API_KEY` was absent, even with the `notifications` module active in production. A project that enables `notifications` is declaring it wants to send real mail; silently swallowing every message into a console log forever, with no expiry on that state, is not a smaller version of "sending mail" — it is not sending mail at all, dressed up as if it were, with a warning nobody is guaranteed to read twice. The same shape of problem existed for `documents`: `fileStoreFor` fell back to `InMemoryFileStore` in production with the `documents` module active and Supabase storage entirely unconfigured, with no warning at all.

Second, structural rather than a config gap: `architecture/` is not a declared layer in `architecture/layers.json`, so none of the generated rules in `.dependency-cruiser.mjs`, nor `scripts/architecture/check-source.ts`, restrict who may import `architecture/modules.ts`. `packages/domain`, whose own `mayImport` is `[]`, could import it today and nothing would object. Decision 0023 added a rule to `AGENTS.md` — "which business modules exist and which are active lives in `architecture/modules.json`... nothing else decides it" — without a gate enforcing it, the one rule in that file without one.

## Decision

### An active optional module needs its real provider in production; there is no partially-configured state

If `notifications` is active and `NODE_ENV=production`, `RESEND_API_KEY` is now required, the same way `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are now both required when `documents` is active in production (not just consistent with each other, which the pairing rule from 0023 already checked — actually present). `mailerFor` and `fileStoreFor` in both `apps/web/src/main/container.ts` and `apps/worker/src/main/container.ts` go back to throwing instead of warning-and-degrading; in practice this code path is unreachable once `env.ts`'s `superRefine` rejects the same condition at parse time, so the throw is defense in depth, not the primary enforcement.

This is a general rule for every optional module with its own external provider, not a one-off for Resend: **switching an optional module on in production is a commitment to configure its provider — the alternative is switching the module off in `architecture/modules.json`, not leaving it half-configured.** `identity` is the deliberate exception, and it is an exception for a specific, checked reason rather than convenience: `identity` is core and can never be switched off, so requiring its Supabase provider unconditionally in production would make "the repository starts and works with zero environment variables" false for the one module every deployment has running. No other core module (`tenants`, `audit`) has an external provider of its own to require, so the exception has exactly one instance.

### `architecture/` is a layer now, with the same mechanism decision 0023 could have used from the start

`architecture/layers.json` gains an `architecture` entry: `path: "architecture"`, `mayImport: []`. `web` and `worker` each add `"architecture": ["src/main"]` to their existing `mayImportOnlyFrom`, exactly the entry already used there for `application` and `domain`. No new code was written in `.dependency-cruiser.mjs` or `scripts/architecture/check-source.ts` — both already generate their rules from `layers.json`, so declaring the layer is the entire fix. Verified in red before being called done: a file placed in `packages/domain` importing `architecture/modules.ts` was rejected by `bun run depcruise`, naming the violation (`dependency-rule-domain: packages/domain/src/probe-architecture-leak.ts → architecture/modules.ts`), then removed.

The same rule immediately rejected `apps/web/test/main/modules.test.ts` and `apps/worker/test/main/modules.test.ts`, which had been importing `architecture/modules` directly to build override activation maps for their assertions. Both now import `defaultModuleActivation`, `isModuleActive` and `ModuleActivation` re-exported from `apps/web/src/main/api.ts` and `apps/worker/src/main/use-cases.ts` respectively — the same files that already read `architecture/modules` to build the object graph, now the single place anything outside `src/main` is allowed to reach it through.

## Consequences

- Enabling `notifications` or `documents` in production without configuring their provider now fails at boot, naming the exact missing variable and pointing at `architecture/modules.json` as the alternative, instead of running in a state that looks active but is not.
- `identity`'s Supabase auth provider remains the one legitimate silent-fallback-to-memory path in production, and it stays that way because it is core, not because no one checked.
- A future business layer file that tries to import `architecture/modules.ts` (or `architecture/layers.json`) directly fails `bun run depcruise` the same way any other dependency-rule violation does, with no new code to maintain — the fix lives entirely in `architecture/layers.json`, the single source decision 0023 already established.
