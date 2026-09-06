---
name: new-view
description: Add a screen under apps/web. Reuses an existing layout and ui primitives for its kind of view instead of inventing a new shape, and never skips the loading, empty and error states. Use when the user asks for a new page, screen or list view.
argument-hint: [view description]
---

View: $ARGUMENTS

1. Name the kind of view this is (a list with search and actions, a detail page, a form, and so on). Look at `apps/web/src/app` and `apps/web/src/layouts` for an existing view of that kind.
2. If one exists, reuse its layout from `apps/web/src/layouts` and extend it rather than writing a new structure. Only build a new layout when no view of that kind exists yet, and put it in `apps/web/src/layouts` so the next one reuses it too.
3. Every button, input, select and textarea comes from `apps/web/src/ui`. Never write one raw; `scripts/architecture/check-source.ts` rejects it. If the control does not exist yet, add it to `apps/web/src/ui` first.
4. If the view loads data, render its three states: loading, empty and error, per `docs/layers/web.md`. A view that only renders the happy path is not done.
5. Every visual value is a Tailwind utility bound to a token in `globals.css`'s `@theme` block. No raw value, no inline `style` (the CSP silently drops it).
6. Run `bun scripts/ui/viewport.ts` before calling the view finished. Fix what it reports; never narrow its widths or thresholds to make it pass.
