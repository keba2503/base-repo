---
status: accepted
date: 2026-09-05
---

# 0006 Multi-tenant from the first entity

## Context

Retrofitting a tenant identifier across entities, repositories, policies and indexes is among the most expensive changes a system can undergo.

## Decision

Every aggregate carries a `TenantId` from day one, even in projects with a single organisation. Repositories are tenant scoped by construction and row level security enforces it again in Postgres. Soft delete applies only to entities marked `SoftDeletable`.

## Consequences

- Single tenant projects run with one tenant row and lose nothing.
- Cross tenant tests are mandatory per repository.
