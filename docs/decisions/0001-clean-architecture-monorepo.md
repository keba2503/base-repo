---
status: accepted
date: 2026-09-05
---

# 0001 Clean Architecture as a bun monorepo

## Context

This repository is the base every project derives from. The architecture must survive many teams, many agents and years of change. Clean Architecture (Martin) provides the rules; chapter 34 warns that without enforcement by tooling, any layering degrades to intention.

## Decision

Each ring is a bun workspace package. A package can only import what its `package.json` declares. `architecture/layers.json` is the single description of the graph; ESLint, dependency-cruiser and agent hooks are derived from it. Rings: domain, application, contracts and adapters, infrastructure and apps.

## Consequences

- Import violations fail at install, lint, commit, push and CI.
- One deployment, one runtime. This is not microservices.
- More files and more boilerplate per feature, paid once for testability without frameworks.
