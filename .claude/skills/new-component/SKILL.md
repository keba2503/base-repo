---
name: new-component
description: Scaffold a business component folder in every ring it needs (domain, application, contracts, adapters, infrastructure) with its index files and first test. Use when a new business concept appears, such as orders, documents or invoices.
argument-hint: [component-name]
---

Component: $ARGUMENTS

Create `src/$ARGUMENTS/` inside each ring the component needs, each with an `index.ts` as the only public entry. Read docs/architecture/layers.md for the internal organisation. Add one failing test in domain for the first invariant and stop for the user to name it.
