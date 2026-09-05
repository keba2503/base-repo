---
read-when: adding an entity with personal data, a consent flow, a retention rule, an export or a deletion
related: [security, ../layers/domain, ../layers/infrastructure]
---

# Data and GDPR

## Classification

Every entity field holding personal data is declared with a classification: `personal`, `sensitive` or `none`. The classification drives log redaction, field encryption, export and anonymisation. An entity with undeclared fields fails review.

## Multi-tenant

`TenantId` is part of every aggregate identity. Repositories are tenant scoped by construction. Row level security is enabled with the tenant set per connection. A test per repository proves cross tenant reads return nothing.

## Soft delete

Only entities implementing `SoftDeletable` carry `deletedAt`. Queries exclude soft deleted rows by default; reading them is an explicit method.

## Rights as use cases

- Access and portability: an export use case walks every repository holding data of a subject and produces a machine readable file.
- Erasure: anonymisation, not deletion. Legal retention, audit trail and outbox references survive with the subject replaced by a token.
- Retention: each entity with personal data declares a retention period. A scheduled job anonymises expired records.

## Consent

Consent is an entity: what was consented, when, from where, and the version of the policy text. Analytics and marketing load only after consent for their category. A policy version change asks again.

## Residency

Supabase project and Vercel functions in a European Union region. Data processing agreements with both.
