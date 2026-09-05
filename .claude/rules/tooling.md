---
paths:
  - "scripts/**"
  - "architecture/**"
  - ".claude/**"
  - ".github/**"
  - "lefthook.yml"
  - ".dependency-cruiser.mjs"
---

Repository tooling. architecture/layers.json is the single source for the dependency graph; ESLint, dependency-cruiser and hooks derive from it. Never weaken a gate to make something pass. A rule change requires a decision record in docs/decisions. Full rules: docs/workflow/quality-gates.md
