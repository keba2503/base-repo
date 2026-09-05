---
read-when: touching any import between packages, or deciding where code lives
related: [layers, boundaries, main, ../standards/code-style]
---

# The Dependency Rule

Source code dependencies point only inward, toward higher level policy.

Nothing in an inner ring may name anything declared in an outer ring: no function, class, type, variable or data format. Data formats produced by an outer ring, such as database rows, HTTP requests or framework objects, never travel inward.

## Rings in this repository

| Ring | Package | Contains |
| --- | --- | --- |
| 1 | `packages/domain` | Entities, value objects, domain events, domain errors |
| 2 | `packages/application` | Use cases, ports, request and response models, authorization policy |
| 3 | `packages/adapters`, `packages/contracts` | Controllers, presenters, view models, zod contracts |
| 4 | `packages/infrastructure`, `apps/web`, `apps/worker` | Drivers: database, providers, framework, views |

The machine readable graph lives in `architecture/layers.json`. ESLint, dependency-cruiser and the agent hooks are generated from it. Change the graph there, nowhere else.

## Crossing a boundary

When control must flow outward, for example a use case that needs the database, the use case declares a port in ring 2 and the outer ring implements it. Dependency inversion keeps the source dependency pointing inward while control flows outward.

## Data that crosses

Plain, isolated structures shaped for the inner ring: request models, response models, view models. Never entities, never rows, never framework objects.

## Enforcement

- Workspace dependencies: a package can only import what its `package.json` declares.
- `bun run arch` reads `architecture/layers.json` and rejects forbidden imports.
- `bun run depcruise` validates the whole graph and cycles.
- Agent hooks run the same check before every file write.
