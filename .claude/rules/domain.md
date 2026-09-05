---
paths:
  - "packages/domain/**"
---

Ring 1. Zero dependencies: no node, no zod, no anything. Entities, value objects, domain events, domain errors, data classification. Every aggregate carries a TenantId. Time and ids arrive as parameters. Full rules: docs/layers/domain.md
