---
read-when: wiring implementations, reading configuration, adding an environment variable
related: [dependency-rule, ports, ../standards/security]
---

# The main component

`apps/web/src/main/` and `apps/worker/src/main/` are the composition roots. They are the only places that know which implementation satisfies each port.

## Responsibilities

- Validate every environment variable once with a zod schema and export typed configuration. `process.env` is forbidden anywhere else and the architecture check enforces it.
- Build the object graph: instantiate infrastructure implementations and hand them to use cases through factory functions.
- Choose the graph per environment. `development` and `test` may wire memory implementations; `production` wires real providers. One factory per environment, selected by configuration.

## Rules

- No business logic. Main is glue.
- No implementation is imported outside main. A view, action or route handler obtains use cases through the factories exported by main.
- Secrets never leave main. A port receives a configured client, never a raw key.
