---
read-when: creating a package, deciding which package a file belongs to
related: [dependency-rule, ports, boundaries, ../layers/domain, ../layers/application, ../layers/adapters, ../layers/contracts, ../layers/infrastructure, ../layers/web]
---

# Layers

Each layer is a bun workspace under `packages/` or `apps/`, published under the `@base` scope. Each layer has its own `CLAUDE.md` importing its rules node from `docs/layers/`.

| Layer | May import | External dependencies |
| --- | --- | --- |
| domain | nothing | none |
| application | domain | none |
| contracts | domain | zod |
| adapters | application, domain, contracts | zod |
| infrastructure | application, domain | anything server side, never next or react |
| web | adapters, contracts, infrastructure; application and domain only inside `src/main` | next, react, tailwind |
| worker | adapters, infrastructure; application and domain only inside `src/main` | node |

## Internal organisation

Inside every layer, code is grouped by business component, not by file type. `packages/application/src/documents/` holds the use cases, ports and models of documents. A component exposes one `index.ts`; nothing else is importable from outside the package.

## What is not a layer

- `architecture/` holds the graph definition.
- `scripts/` holds repository tooling. It is not imported by any layer.
- `docs/` holds the knowledge graph read by people and agents.
