---
status: accepted
date: 2026-09-05
---

# 0002 Postgres through Drizzle, not supabase-js

## Context

Supabase provides Postgres, Auth, Storage and Realtime. supabase-js speaks PostgREST and is designed for browsers talking directly to the database under row level security. In this architecture the browser never talks to the database.

## Decision

The application connects to Postgres through Drizzle over the Supabase pooler with a dedicated role. Migrations live in the repository. Row level security stays enabled as a second barrier. Auth and Storage are used through ports.

## Consequences

- Real transactions, joins and typed queries.
- No anon key in any client bundle.
- The schema is owned by the repository, not by the dashboard.
- Switching to another Postgres host changes one folder in infrastructure.
