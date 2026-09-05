---
name: new-feature
description: Add functionality across the rings in the mandated order. Use when the user asks for a new capability, screen, operation or API endpoint.
argument-hint: [description of the functionality]
---

Functionality requested: $ARGUMENTS

1. Delegate the design to the architect agent with the request. Wait for the plan.
2. Show the plan to the user in five lines and stop for confirmation.
3. After confirmation, delegate implementation to the implementer agent ring by ring, following docs/workflow/new-feature.md.
4. Delegate review to layer-guardian and security-reviewer in parallel.
5. Fix blocking findings through the implementer. Run `bun run check`.
6. Report rings touched, files, tests, decision records written.
