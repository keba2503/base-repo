---
paths:
  - "apps/web/**"
  - "apps/worker/**"
---

Ring 4, delivery mechanism. Imports @base/adapters, @base/contracts, @base/infrastructure; @base/application and @base/domain only inside src/main. Views render view models and decide nothing. Server Actions and route handlers are thin: parse, call controller, map outcome. The UI never calls its own HTTP API. Full rules: docs/layers/web.md
