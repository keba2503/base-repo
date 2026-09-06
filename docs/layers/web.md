---
read-when: editing anything under apps/web
related: [../architecture/boundaries, ../architecture/main, ../standards/security, ../standards/design, adapters]
---

# Web rules

Ring 4. Next.js is a delivery mechanism. It may import `@base/adapters`, `@base/contracts` and `@base/infrastructure`. It may import `@base/application` and `@base/domain` only inside `src/main`.

This repository is a base: projects derive from it and each one builds its own look. Nothing in this document decides what anything looks like. What it decides is that the same kind of view is never invented twice, that a view never crashes silently on a phone, and that a form never asks someone to read text they cannot see. Discipline, not aesthetics.

## `src/ui`, `src/layouts` and the reuse rule

- `src/ui` holds every interactive primitive: buttons, inputs, selects, textareas, and whatever else a view needs to let someone act. Writing `<button>`, `<input>`, `<select>` or `<textarea>` directly anywhere under `src/` is forbidden and enforced by `scripts/architecture/check-source.ts` (rule `reuse-ui-primitives`); the exception is `src/ui` itself, where the raw element has to be written once for everyone. Two views never grow two different buttons. If a view needs a control that does not exist yet, it is added to `src/ui` first, so the next view finds it already there instead of writing its own.
- `src/layouts` holds the shells shared by several views of the same kind: how a viewport is divided between a search bar, a table and its actions, for instance, not what any of them looks like. A layout decides structure and responsive behaviour; it never decides color, radius or type.
- The second view of a kind that already exists does not invent its own template. It reuses the layout and the primitives the first one used, or it extends them, in that order. A search bar, a table and a row of actions are the same shape every time they appear, styled by tokens, laid out by the shared layout; only the columns, the filters and the actions themselves change. Inventing a second shape for something that already has one is exactly the problem this rule exists to close.

## Tokens, never values by hand

- Every visual value — color, radius, spacing, type — comes from the tokens declared in `globals.css`'s `@theme` block. A Tailwind utility bound to a token (`bg-background`, `rounded-md`, `p-4`) is correct; a raw value (`bg-[#2563eb]`, `rounded-[7px]`, an inline `style` with a hex or a pixel count) is not, because it cannot be changed in one place and it defeats a CSP that does not allow inline styles.
- The tokens in `globals.css` today are the ones Next.js scaffolds by default: a blue accent, a gray scale, no radius opinion. They are placeholders, not a decision, and they are deliberately not changed here — this repository does not get to pick a derived project's palette or typography. What every derived project must do, before building a single view, is replace them with its own: its accent, its neutral scale, its radii, its type. Building screens against the placeholder tokens produces a repository that ships the placeholder look by accident, indistinguishable from every other unstyled Next.js app; the fix afterward is a rewrite, not a restyle, because every view that reused the tokens correctly still has to be re-touched to reuse the new ones.
- Anything the reset needs — resetting margin and padding, setting the body font — belongs inside `@layer base` in `globals.css`, never outside every layer. A rule left outside all `@layer` blocks sits in an implicit layer that outranks `base`, `components` and `utilities` alike, so it silently wins over every Tailwind utility that touches the same property; a `padding: 0` reset written that way makes every `p-*`, `px-*` and `py-*` in the app a no-op. This is not hypothetical: it is exactly what shipped in this repository until it was found by the viewport gate and fixed by wrapping the reset in `@layer base`.

## States a view that loads data must contemplate

A view that fetches anything, on the server or after an interaction, decides nothing about the fetch itself, per `docs/architecture/boundaries.md`; it only decides how to render the three states a presenter can hand it:

- **Loading.** Something visible immediately, sized like the content it replaces, never a blank screen and never a layout jump when the real content arrives.
- **Empty.** A state that is not just the loading state with zero rows in the table and not just the error state with a friendlier tone. It tells the person what is missing and, where there is one, what to do about it.
- **Error.** A state that names what failed in terms the person can act on, offers a retry where retrying can plausibly help, and never renders a raw provider message or a stack trace — that boundary already exists in `docs/standards/security.md` and applies here too.

## Responsive, checked by a gate that measures

`scripts/ui/check-viewport.ts` (pure checks) and `scripts/ui/viewport.ts` (the runnable gate: boots the app, visits every static route and every tracked document under `docs/`, measures at 375, 768, 1440 and 1920px) fail a view that:

- Overflows horizontally at any of those widths (`document.documentElement.scrollWidth` greater than `clientWidth`).
- Has a button, link, form field or other pointer target under 44×44px — the minimum a finger can reliably hit.
- Sets a form field's text under 16px — below that, iOS zooms in on focus and the form becomes unusable until the person zooms back out.
- Lets a label's box overlap the box of the field it labels, once a field genuinely associated by `for`/`id` sits elsewhere in the layout (a label that wraps its own field, the common accessible pattern, is not flagged: its box containing the field's box is structure, not a collision).

A view can still fail every one of these at a width nobody thought to check by hand; that is the point of a gate that opens a real browser instead of trusting a description of one.

## What the gate cannot measure

Some accessibility failures have no geometry to check and stay a matter of review, not tooling:

- Every interactive element reachable and operable by keyboard alone, in an order that matches the visual layout.
- A visible focus indicator on every focusable element; removing the browser's default without replacing it is a defect, not a style choice.
- Every image with alt text that describes it, or `alt=""` when it is purely decorative; every icon-only control with an accessible name.
- Color is never the only signal — a required field, an error, a selected state each need a second cue (text, icon, position) for someone who cannot distinguish the color.
- Text contrast against its background meets WCAG AA for its size.
- A consent flow, or any choice presented as a pair of options, costs exactly the same number of steps to decline as to accept — a one-click accept next to a decline buried in a second screen is not a real choice.

## Views

- Server Components and Client Components receive view models and render them. No fetching logic, no formatting, no business conditionals.
- A page obtains its view model by calling a controller through the factories in `src/main`, then passes it down.
- Styling with Tailwind utilities bound to the semantic tokens in `globals.css`. Palette and typography change in one `@theme` block.

## Server Actions and route handlers

- Parse the raw input, call the controller, map the outcome to a redirect, a revalidation or a response. Nothing else.
- The external API lives under `src/api` and is mounted at `/api/v1`. The UI never calls it.

## Security in this layer

- Security headers and the per request CSP nonce are set in `src/proxy.ts`.
- Cookies are HttpOnly, Secure, SameSite=Lax.
- Nothing from `@base/infrastructure` is imported by a Client Component.
- The CSP this repository ships does not allow inline `style` attributes; a `style={{ ... }}` prop is silently ignored by the browser, not an error anyone sees. This is one more reason values come from token-bound Tailwind classes and never from an inline style.
