# Agent guide

This repository is a base. Projects derive from it. It follows Clean Architecture (Martin) and enforces it with tooling. Read this file first; it is the map. Follow links only when your task needs them.

## Hard rules

1. Dependencies point inward. `architecture/layers.json` is the graph. Nothing else defines it.
2. No comments in any file, of any syntax. Names carry meaning.
3. No `any`. No `process.env` outside `apps/*/src/main`.
4. bun only. Never npm, pnpm, yarn or npx.
5. Never push, deploy, force, reset hard or bypass hooks unless the user asked in their own words.
6. Never weaken a gate to make something pass. Propose a decision record instead.
7. Conventional commits. No AI attribution in commits.
8. Every port ships with interface, contract suite, memory implementation, real implementation and wiring.
9. Every aggregate is tenant scoped. Every use case authorizes before acting.
10. Views decide nothing; presenters decide everything visible; use cases decide everything else.
11. Adding or removing a directory updates `ESTRUCTURA.md` in the same change. `bun run structure` enforces it.

## Map

| Read when | File |
| --- | --- |
| deciding where code lives | docs/architecture/dependency-rule.md |
| creating or touching a package | docs/architecture/layers.md |
| a use case needs the outside world | docs/architecture/ports.md |
| writing a controller, presenter, action, handler or view | docs/architecture/boundaries.md |
| wiring or configuration | docs/architecture/main.md |
| editing `packages/domain` | docs/layers/domain.md |
| editing `packages/application` | docs/layers/application.md |
| editing `packages/contracts` | docs/layers/contracts.md |
| editing `packages/adapters` | docs/layers/adapters.md |
| editing `packages/infrastructure` | docs/layers/infrastructure.md |
| editing `apps/web` or `apps/worker` | docs/layers/web.md |
| editing `apps/*/src/main` | docs/layers/main.md |
| adding functionality | docs/workflow/new-feature.md |
| adding a port | docs/workflow/new-port.md |
| a gate blocked you | docs/workflow/quality-gates.md |
| writing any code | docs/standards/code-style.md |
| writing tests | docs/standards/testing.md |
| anything a user can send, secrets, providers | docs/standards/security.md |
| personal data, consent, deletion, tenants | docs/standards/data-and-gdpr.md |
| why is it like this | docs/decisions/README.md |
| what a directory is for | ESTRUCTURA.md |

## Workflow

Design before code for anything beyond a one ring change. Inner rings first. Tests before moving outward. `bun run check` green before reporting. Report what was left undone and why.
