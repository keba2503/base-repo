---
paths:
  - "apps/*/src/main/**"
---

Composition root. The only place that reads process.env (validated once with zod), imports implementations and wires ports. One container factory per environment. No business logic. Full rules: docs/layers/main.md
