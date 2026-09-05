---
paths:
  - "packages/contracts/**"
---

Ring 3. Imports @base/domain and zod only. One contract per operation with input, output, error codes and metadata (auth, humanCheck, idempotent, rateLimit). Versioned by folder. Outputs are allow lists. Full rules: docs/layers/contracts.md
