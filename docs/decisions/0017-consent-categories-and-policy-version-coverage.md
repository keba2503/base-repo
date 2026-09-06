---
status: accepted
date: 2026-09-06
---

# 0017 Consent categories exclude what is strictly necessary, and coverage is checked against the policy version, not just a flag

## Context

`docs/standards/data-and-gdpr.md` already stated the rule before any code existed: "Consent is an entity: what was consented, when, from where, and the version of the policy text. Analytics and marketing load only after consent for their category. A policy version change asks again." Two design questions followed from that sentence: which categories exist, and how "a policy version change asks again" is enforced without a second, separate mechanism.

## Decision

`ConsentCategory` is `"functional" | "analytics" | "marketing"`. There is no `"necessary"` category. Strictly necessary processing (the session cookie, the tenant chosen, CSRF protection) is not consent at all under GDPR Recital 30 and ePrivacy — it is disclosed in a privacy notice, never gated behind an accept button, and this repository does not model it as a `Consent` row because there is nothing to withdraw: it cannot be turned off without breaking the service the visitor is already using. Modelling it as a category would invite a future bug where someone builds a toggle for it.

`Consent` does not store "is this still valid" as a boolean the caller has to remember to check against today's policy. It stores `policyVersion` (the version in force at the moment of granting) and exposes `covers(currentPolicyVersion): boolean`, which is `true` only when the consent is active (`withdrawnAt === null`) and `this.policyVersion === currentPolicyVersion`. The moment the site's policy text changes and the deployed policy version string changes with it, every previously granted consent stops covering processing automatically, without a migration, a backfill job, or a flag anyone could forget to flip. `hasActiveConsent` (`packages/application/src/privacy/has-active-consent.ts`) always takes the current policy version as part of its request and delegates the comparison to `covers`, so "did the policy change" is a domain rule, not a query someone could write differently in two call sites.

## Consequences

- A visitor who granted consent under policy `2026-01-01` and is asked again once the site ships policy `2026-06-01` is not a bug: the banner must show again for them, per `hasActiveConsent` returning `covered: false`, exactly as `docs/standards/data-and-gdpr.md` requires.
- Nothing prevents a project built on this base from adding a fourth category later (e.g. `"personalization"`); `consentCategories` in `packages/domain/src/consent/consent.ts` is the single place that enumerates them, and `isConsentCategory` is the guard everything else should use instead of a fresh string comparison.
- The cookie banner in `apps/web/src/app/cookie-consent` never renders a toggle for "necessary" cookies, on purpose: there is nothing to ask, and a UI that pretends there is invites the exact dark pattern ("necessary" pre-checked and disabled next to real choices) `docs/standards/security.md`'s spirit and plain GDPR guidance rule out.
