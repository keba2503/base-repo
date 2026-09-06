---
status: accepted
date: 2026-09-06
---

# 0022 Analytics loads under the existing strict-dynamic policy, and server events never let the browser talk to the provider

## Context

`docs/standards/data-and-gdpr.md` states the rule this change had to satisfy without exception: "Analytics and marketing load only after consent for their category." Phase 3 of this wave already built the mechanism to ask that question (`hasActiveConsentOperation`, wrapped by `apps/web/src/main/privacy.ts`'s `readConsentStatus`) and the mechanism to answer it (the cookie banner, `apps/web/src/app/cookie-consent`). What phase 3 did not yet answer: whether a third-party analytics script can load at all under `apps/web/src/proxy.ts`'s CSP, which has no host allowed in `script-src` beyond `'self'`, and if it can, what "the server sends events too" means without reintroducing the exact thing `docs/standards/security.md` forbids — "the browser never talks to Supabase or any provider" (Supabase named, but the sentence's reasoning is general: a provider secret or a provider's own trust boundary has no business in the browser).

## Decision

### The script loads without widening script-src

`script-src 'self' 'nonce-<per request>' 'strict-dynamic'` already does the work. Under `strict-dynamic`, a script element carrying the request's nonce is trusted, and CSP3 extends that trust to every script it inserts into the DOM by script, regardless of that script's own origin or nonce — which is exactly how Google Tag Manager's loader snippet works: it calls `document.createElement('script')` and sets `.src` to `googletagmanager.com/gtm.js`, and that child script inherits the parent's trust because the parent inserted it, not because `googletagmanager.com` was ever added to an allowlist. `AnalyticsScripts` (`apps/web/src/app/analytics/analytics-scripts.tsx`) reads the nonce the proxy already puts on `x-nonce` and sets it on the one inline `<script>` it renders; nothing in `proxy.ts` changed. This is the answer the task asked for directly: when a third party's script cannot load without opening the policy, say so instead of opening it — here it can, so nothing was opened.

This does not extend to whatever a marketer configures inside the GTM container later. A "Custom HTML" tag that drops a tracking pixel on a new host, or a script that calls `fetch` against a new origin, still needs that host added to `img-src` or `connect-src` deliberately, one host at a time, the day someone actually adds that tag — not preemptively, and never by loosening `script-src` to cover it. `strict-dynamic` solves the loader problem, not every problem a container could someday introduce.

### The gate is a dynamic hole, not a cached one

`AnalyticsScripts` and the cookie banner's `known` check both call `cookies()` inside `RootLayout` (`apps/web/src/app/layout.tsx`), a dynamic API that Next.js's Cache Components model (`docs/decisions` references Next 16 elsewhere in this repo) never inlines into a prerendered shell: a Server Component reading `cookies()` is always a per-request hole, cached page or not. If a route in a derived project opts into `"use cache"` for its own content, the analytics gate must stay exactly where it is — outside that boundary, reading `cookies()` directly — or a shell built for one visitor's consent state (or no visitor at all, at build time) would serve every later visitor the same decision. This is not a new rule; it is why the gate lives in the same Server Component that already had to make this same call for the banner.

Consent granted in the browser takes effect on the next Server Component render, not before: `submitConsentDecision` (`apps/web/src/app/cookie-consent/actions.ts`) is a Server Action, and the banner only knew to hide itself locally, without telling the App Router anything server-rendered had changed. `cookie-banner.tsx` now calls `router.refresh()` immediately after the action resolves, so `AnalyticsScripts` (and anything else gated the same way) reflects a just-granted or just-withdrawn decision on the same visit, not on the next one.

### Server events never reach the provider from the browser

"Events de servidor" are sent by `Analytics.track` (`packages/application/src/kernel/ports/analytics.ts`), a normal port with `InMemoryAnalytics`/`NoopAnalytics` in `packages/infrastructure/src/memory/analytics.ts` and `MeasurementProtocolAnalytics` in `packages/infrastructure/src/analytics/measurement-protocol.ts` sending to GA4's Measurement Protocol collect endpoint — chosen over letting the browser call a provider directly for three reasons at once: the `GA_API_SECRET` this needs never has to exist in a bundle shipped to a browser; consent is checked authoritatively on the server, by the same `readConsentStatus` the rest of this wave already trusts, rather than by a client-side check a visitor with developer tools open could skip; and no `connect-src` addition was needed, because the only network call the browser makes is to this app's own Server Action, same origin, already covered by `default-src 'self'`.

`trackServerEvent` (`apps/web/src/main/analytics.ts`) is the one call site any Server Action or route handler uses: it reads consent for the given visitor, does nothing if the category is not covered, and never throws past itself (a failed analytics call is logged and swallowed, never a reason a user-facing action fails). This wave wires exactly one call, from `submitConsentDecision` itself (`consent_updated`, with the three category booleans as params) — a real, working example of consent gating an event end to end, not a placeholder. Every other Server Action in a derived project reaches for the same function; nothing here special-cases the consent action beyond it being the first and, so far, only caller.

## Consequences

- `GTM_CONTAINER_ID`, `GA_MEASUREMENT_ID` and `GA_API_SECRET` are optional in every environment. Analytics in this base repository is off by default and stays off if unconfigured; a derived project turns it on by setting environment variables, not by uncommenting code.
- A visitor who withdraws analytics consent stops receiving the GTM loader on their next render (via `router.refresh()`) and stops generating server events on the next `trackServerEvent` call for their `visitorId`, because both ask the same up-to-date `readConsentStatus` every time; neither caches a "consented" answer past the moment it is read.
- `Analytics` was not asked to be a `SubjectDataSource` or given contract-suite parity with the request/DB-backed ports in this repo (no Postgres implementation exists, because Measurement Protocol has no local store to isolate by tenant): it is an outbound, fire-and-forget side channel, closer in shape to `Mailer` than to `ConsentRepository`, and its contract suite (`packages/infrastructure/test/contracts/analytics.contract.ts`) reflects that — behavioural only, run against the real `MeasurementProtocolAnalytics` with an injected `fetchImpl` rather than skipped for lack of a live account, the same pattern `ResendMailer`'s test file already uses for its own offline assertions.
