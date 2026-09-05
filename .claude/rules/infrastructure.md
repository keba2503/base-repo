---
paths:
  - "packages/infrastructure/**"
---

Ring 4, server only. Imports @base/application and @base/domain. Never next or react. Every port has a memory implementation, a real one and a contract suite run against both. Repositories are tenant scoped by construction. Rows never leave this package. No configuration reads. Full rules: docs/layers/infrastructure.md
