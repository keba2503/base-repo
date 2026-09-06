---
read-when: making a tradeoff, or wondering why something is the way it is
related: [../architecture/dependency-rule]
---

# Decision records

One file per decision, numbered, never edited after acceptance. A reversal is a new record that supersedes the old one.

| Number | Title | Status |
| --- | --- | --- |
| 0001 | Clean Architecture as a bun monorepo | accepted |
| 0002 | Postgres through Drizzle, not supabase-js | accepted |
| 0003 | External API with Hono inside Next.js | accepted |
| 0004 | Billing cycles are ours, not the provider's | accepted |
| 0005 | No comments in code | accepted |
| 0006 | Multi-tenant from the first entity | accepted |
| 0007 | Row level security keyed on a transaction local setting | accepted |
| 0008 | Identity resolution and api keys | accepted |

## Template

```
---
status: proposed | accepted | superseded by NNNN
date: YYYY-MM-DD
---

# NNNN Title

## Context
## Decision
## Consequences
```
