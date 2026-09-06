---
status: accepted
date: 2026-09-05
---

# 0008 Identity resolution and api keys

## Context

Every request must resolve to an `Actor` before a use case runs. Sessions come from Supabase Auth, machines authenticate with api keys, and a person may belong to several tenants. The identity component has to decide who a user is before any tenant context exists, without breaking the rule that every aggregate is tenant scoped.

## Decision

- `User.id` is the subject id issued by the identity provider. No second identifier is kept, so a verified session maps to a user without a lookup table.
- `User` carries the tenant that registered it as its home tenant. Belonging to other tenants is expressed only through `Membership`. A user is registered into a tenant by `registerUser`, which reuses the existing user when the subject is already known.
- `UserRepository`, `MembershipRepository` and `ApiKeyRepository` accept the same `TenantScope` as `TenantRepository`. Actor resolution and user registration run at registry scope because they happen before or across tenant contexts; everything else runs tenant scoped.
- `resolveActorFromSession` selects the membership named by the request (tenant id or slug) and otherwise the first membership returned by the repository, which is the oldest one granted. A tenant the user does not belong to and a tenant that does not exist produce the same forbidden error.
- Authorization for user actors is decided by `RolePermissions` from the membership stored for the actor's tenant and the domain permission matrix, never from the scopes carried by the actor. Api key and system actors are decided by their scopes. `tenants:create` is granted to owners only; it is the registry level operation of the matrix.
- An api key is `ak_<key id without hyphens>.<secret>`. The prefix is the key id, so it is unique by construction and the lookup before the tenant is known needs no extra index. The stored hash is an HMAC-SHA256 of the whole plaintext under a per installation pepper, compared in constant time. The plaintext is returned once by `createApiKey` and never stored.
- `createApiKey` refuses any scope the creating actor does not hold itself, so a key can never exceed its creator.
- Revocation is a state of the key, not a deletion: revoked keys stay for audit and resolve to a distinct forbidden error.

## Consequences

- Provisioning a user requires the subject id from the identity provider first; invitation flows must create the auth user before calling `registerUser`.
- The first owner of a tenant is provisioned outside this component (seed or a future tenant onboarding use case).
- Rotating the pepper invalidates every api key; it is a deliberate operational act.
- Postgres repositories for users, memberships and api keys are owned by the persistence slice; only memory implementations ship here.
