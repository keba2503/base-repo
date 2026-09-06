---
status: accepted
date: 2026-09-06
---

# 0023 Module activation is a static file next to the layer graph, never a runtime flag checked with `if`

## Context

Before this change, `requiredInProduction` in each `apps/*/src/main/env.ts` demanded nine environment variables in production, unconditionally. A derived project that will never send email still had to set `RESEND_API_KEY`, or the process refused to start. The nine variables belonged to different business concerns (Supabase auth, Supabase storage, Resend, Turnstile, Sentry, field encryption) that a given deployment may or may not need, but the schema could not tell them apart: it only knew "production" and "not production."

This repository is a base other projects derive from (`AGENTS.md`, line 1). A base that forces every derived project to configure every optional provider is not a base, it is a maximal example pretending to be one. The fix has to answer two separate questions, and answer them in a way a Magento engineer would recognise: which business modules exist, and which of them are switched on for this deployment.

Magento answers the second question in `config.php`, a checked-in file the module system reads once at bootstrap; a module marked inactive there never registers its routes, observers or cron jobs. Magento's *other* well-known pattern — sprinkling `if ($helper->isModuleEnabled())` through unrelated code — is explicitly the one to avoid: it silently degrades instead of failing loudly, and it ships dead code that still runs occasionally when someone forgets a check.

## Decision

### Shape: `architecture/modules.json`, read through `architecture/modules.ts`

`architecture/modules.json` is a plain JSON object, one entry per business module, each with the same three fields: `core` (boolean), `active` (boolean) and `dependsOn` (a list of other module names). It sits next to `architecture/layers.json` on purpose — that file is already the single source of truth for the dependency graph between rings, read directly by `dependency-cruiser`, by `scripts/architecture/check-source.ts`, and by nothing else. `architecture/modules.json` is the same kind of fact about the same repository, at a different axis: not "who may import whom" but "which business capability is switched on." Two static, declarative, JSON files at the repository root, each owning one axis of composition, is easier to keep coherent than folding module activation into either `layers.json` (a different concern: rings, not features) or into `apps/*/src/main/env.ts` (environment variables, not module identity).

`architecture/modules.ts` wraps the JSON exactly the way `scripts/architecture/layers.ts` wraps `layers.json`: typed accessors, no business logic. `isModuleActive(name, activation = defaultModuleActivation)` takes the activation map as a parameter with the static file as its default, rather than reading a module-level singleton directly. This is the one deliberate deviation from the `layers.ts` precedent, and it exists for one reason: testability. The requirement that a modularity test start the composition root with each optional module switched off, one at a time, and prove it does not break, needs some way to construct a *different* activation than the one shipped in the file, without mutating a checked-in file inside a test run. Every production call site keeps calling the parameterless form; only test code passes an override.

### Every module gets the same shape

`core`, `active` and `dependsOn` are declared on every module, including the core ones, rather than giving core modules a narrower shape. A JSON file where some entries have three keys and others have one is a worse single source of truth than one where the reader never needs to ask "does this entry have an `active` field or not" — and it matches `layers.json`, where every layer entry carries the same keys whether or not a given layer uses all of them.

### Core modules are declared, not inferred, and the declaration is checked against the code

`tenants`, `identity` and `audit` are `core: true`. This was verified, not assumed: `create-tenant.ts` and `revoke-api-key.ts` both call `auditScopedTo(...).record(...)` as a direct, synchronous step inside their own transaction — not through the event-handler indirection that lets `notifications` degrade safely when absent. If `audit` were missing, those two use cases could not be constructed, let alone run. `jobs`, by contrast, is used the same direct way, but only by `documents` (`confirm-document-upload.ts`) and `privacy` (`request-data-export.ts`, `request-erasure.ts`) — nothing in `tenants` or `identity` imports it. `jobs` is therefore declared optional, with `documents` and `privacy` each declaring it in `dependsOn`; the original suspicion that `jobs` was core, alongside `tenants` and `identity`, does not hold once the imports are read, and this file is the place that correction is recorded.

`assertModuleGraphIsValid()`, called once at the top of each `env.ts`, rejects two situations at boot, before a single request is served: a core module marked `active: false`, and an active module whose `dependsOn` names an inactive module. Both are configuration mistakes a derived project can make by hand-editing the JSON file, and both are cheap to catch before the first request rather than at the first call site that happens to need the missing piece.

### What the composition roots do with it

`apps/web/src/main` and `apps/worker/src/main` read `architecture/modules.ts` directly and use it to decide, once, at the moment the object graph is built: whether to include the `documents` controllers in `ApiControllers` (and therefore whether `defaultRoutes` ever registers a document route at all), whether `dispatchOutboxOperation` registers `sendTenantWelcome` as a handler, and whether `dispatchJobsOperation` registers `processDocument` as an executor. None of these are `if (isModuleActive(...))` checks buried inside a use case or a handler; they are decisions made once, at the edge, about what gets constructed. A module that is off does not run a hidden branch — its code is never called at all.

`packages/infrastructure` persistence primitives (repositories, the outbox, the job queue) stay unconditional regardless of module activation. They cost nothing to construct (in-memory by default, real providers only when credentials are present) and multiple modules share them; gating *construction* of a kernel-level port would only reintroduce the `if` pattern this decision exists to avoid, one layer down. What module activation gates is which use cases, routes, executors and handlers are ever wired to those primitives.

## Consequences

- A derived project switches a module off by editing one boolean in `architecture/modules.json` and committing the change, exactly like flipping `<active>0</active>` in a Magento `config.php` — no environment variable, no code change, no scattered flag.
- `documents` requires `jobs`; `privacy` requires `jobs` and `documents`. Turning `documents` off without also turning `privacy` off is rejected at boot with a message naming exactly which dependency is missing.
- `cookie-consent` (`apps/web/src/app/cookie-consent`) depends on `privacy` through `apps/web/src/main/privacy.ts`. Turning `privacy` off does not crash the banner; consent decisions are silently not persisted and analytics defaults to "not consented." This coupling is real and is documented in `ESTRUCTURA.md`, not hidden.
- `apps/web/test/main/modules.test.ts` and `apps/worker/test/main/modules.test.ts` exercise the real composition-root functions (`buildApiDependencies`, `readConsentStatus`, `recordConsentDecision`, `dispatchOutboxOperation`, `dispatchJobsOperation`) with an overridden activation map, proving the claim of modularity against running code rather than against a diagram.
