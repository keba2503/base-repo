---
status: accepted
date: 2026-09-05
---

# 0007 Row level security keyed on a transaction local setting

## Context

Decision 0002 keeps row level security enabled as a second barrier behind tenant scoped repositories. The application reaches Postgres through the Supabase transaction pooler, where a session is not owned by one caller: anything set with `SET` leaks to the next transaction on the same physical connection. The `TenantRepository` port has two scopes, `registry` (the platform acting on tenants as a whole) and `tenant` (one tenant reading and writing its own data), and the outbox is written inside the same transaction as the aggregate that produced the events, then drained by a worker that has no tenant.

## Decision

- The tenant context is the transaction local setting `app.tenant_id`, applied with `set_config('app.tenant_id', value, true)` by every repository statement. Every repository statement runs inside a transaction, reusing the ambient one when a unit of work is open, so the setting never outlives the transaction and never reaches a pooled session.
- A repository sets the value that matches its scope on every call: the tenant identifier for `tenant`, the empty string for `registry`. A registry lookup inside a transaction opened by a tenant scoped repository therefore sees the registry, not a leaked tenant.
- The SQL function `current_tenant_id()` turns the setting into `uuid`, treating unset and empty as `NULL`. A malformed value fails the cast and the statement, which is the safe direction.
- Policies on `tenants`: when the setting is unset, `SELECT`, `INSERT` and `UPDATE` on every row (lookup by slug, creation, and the upsert `save` performs). When it is set, `SELECT`, `INSERT` and `UPDATE` only on the row whose `id` equals the setting. No policy grants `DELETE`.
- Policies on `outbox`: when the setting is unset, everything (the registry enqueues `tenant.created` for a tenant that has no context yet, and the worker relay is cross tenant by nature). When it is set, every command is restricted to rows whose `tenant_id` equals the setting.
- Row level security is forced, so even the table owner is subject to the policies unless the role bypasses them. The role `app_user` is created with `LOGIN NOINHERIT NOBYPASSRLS` and only `SELECT`, `INSERT`, `UPDATE` on both tables plus usage of the outbox sequence. Its password is set outside the repository. Supabase's `anon` and `authenticated` roles lose every privilege on both tables when they exist.
- Migrations are generated without statement breakpoints, so migration files carry no comment markers; the postgres.js driver runs a whole file as one simple protocol query.

## Consequences

- Tenant isolation is proven twice: the repository adds the tenant filter to every statement, and the database refuses what the filter missed.
- A registry connection can read every tenant row. That is the registry's job; the composition root decides who gets a registry repository.
- The outbox relay must run without a tenant context. Giving the worker a tenant scoped connection would starve it silently.
- The contract suites exercise the policies only when `DATABASE_URL` points at a role that does not bypass row level security; a superuser or a `BYPASSRLS` role exercises the repository filter alone.
- `drizzle.config.ts` cannot import `drizzle-kit` because bun links dependencies per workspace, so the config is a plain object with paths relative to `packages/infrastructure`, where the `db:*` scripts run.
