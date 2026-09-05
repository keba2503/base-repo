---
name: gate
description: Run every quality gate and explain each failure with the rule it breaks and where the fix belongs. Use before a commit, before a pull request, or when the user asks whether the repository is green.
---

Run `bun run check`. For each failure, state file, line, rule, and the ring where the fix belongs. Never propose weakening a rule. If everything is green, say only that and the counts.
