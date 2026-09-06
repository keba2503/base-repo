---
paths:
  - "apps/web/**"
  - "apps/worker/**"
---

Ring 4, delivery mechanism. Imports @base/adapters, @base/contracts, @base/infrastructure; @base/application and @base/domain only inside src/main. Views render view models and decide nothing. Server Actions and route handlers are thin: parse, call controller, map outcome. The UI never calls its own HTTP API.

Interactive elements (button, input, select, textarea) are never written raw anywhere under src, layouts included: they come from src/ui, enforced by check-source.ts. A second view of a kind reuses src/ui and src/layouts instead of inventing its own shape. Every visual value comes from the tokens in globals.css's @theme block, never a raw value or an inline style (the CSP blocks inline style attributes silently). A derived project replaces those tokens with its own before building screens; this repository's own tokens are Next's defaults and stay that way on purpose. Any view that loads data renders loading, empty and error states. scripts/ui/viewport.ts gates horizontal overflow, sub-44px tap targets, sub-16px form field text and label/field overlap at 375/768/1440/1920px; keyboard order, focus visibility, alt text and color-only signaling are not measured by it and stay a review concern.

Full rules: docs/layers/web.md
