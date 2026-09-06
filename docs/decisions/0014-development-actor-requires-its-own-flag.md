---
status: accepted
date: 2026-09-06
---

# 0014 The development actor requires its own flag, not just NODE_ENV

## Context

`resolveActorOrDevelopmentFallback` let a caller without a session or an api key act as a system actor scoped to the platform tenant, with `tenants:create`, `tenants:read` and `outbox:dispatch`, whenever `NODE_ENV` was `development`. `NODE_ENV` is set by the hosting platform or the build tooling, not by a decision made for this application specifically; a preview deployment or a misconfigured environment that inherits `NODE_ENV=development` handed those scopes to any unauthenticated visitor.

## Decision

The fallback now also requires `ALLOW_INSECURE_DEV_ACTOR=true`, a variable that exists for no purpose other than enabling this fallback and is parsed with `z.stringbool()` so the literal string `"false"` is not coerced to true. Configuration validation refuses to start in production when this variable is set, regardless of `NODE_ENV`, so promoting a development configuration to production fails loudly at boot instead of silently granting the fallback in front of real traffic.

Local development that wants the fallback sets both `NODE_ENV=development` and `ALLOW_INSECURE_DEV_ACTOR=true` explicitly, in an env file that never reaches a deployed environment.

## Consequences

- A deployment that inherits `NODE_ENV=development` by accident no longer grants the development actor; it also needs the dedicated flag, which no deployment pipeline should ever set.
- A developer who wants the old one-line convenience of skipping login locally now sets one more variable once, in `.env.local`.
- If a future environment legitimately needs an unauthenticated system actor outside local development, that is a new, explicit use case, authorized on its own terms; it must not be reintroduced under this flag or under `NODE_ENV`.
