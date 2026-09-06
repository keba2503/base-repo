---
status: accepted
date: 2026-09-06
---

# 0012 Configuration is validated at runtime, not at build

## Context

The composition root validates every environment variable once with zod and requires the production secrets when `NODE_ENV` is `production`. A Next.js production build sets `NODE_ENV` to `production` and imports the composition root while collecting page data, so building without secrets failed. Continuous integration builds every pull request and has no production secrets, which left the pipeline red by construction. Handing dummy secrets to the build would make the pipeline pass while proving nothing.

## Decision

A build is not a runtime. During the Next.js production build phase, identified by `NEXT_PHASE`, the composition root parses and types configuration but does not require the production secrets. Every other execution keeps the requirement. Delivery mechanisms build their object graph on first request instead of at module load, so importing a route during the build never constructs a provider client.

## Consequences

- Continuous integration builds without secrets and still compiles the real code.
- A deployment missing a secret fails on its first request rather than at build time. The failure is loud and immediate, and the platform reports it as a runtime error.
- Route modules must not construct dependencies at module scope. The lazy handler in the API route is the pattern to copy.
