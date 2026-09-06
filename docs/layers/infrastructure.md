---
read-when: editing anything under packages/infrastructure
related: [../architecture/ports, ../standards/testing, ../standards/security, ../standards/data-and-gdpr]
---

# Infrastructure rules

Ring 4. Depends on `@base/application` and `@base/domain`. Never next or react. The package entry imports `server-only`, so any client bundle that reaches it fails at build time.

Next resolves `server-only` to an empty module under the `react-server` condition. A consumer outside Next, such as `apps/worker` or `bun test`, must pass `--conditions react-server` or the import throws.

## Layout

- `src/memory/`: in-memory implementation of every port. Complete, not a stub.
- `src/postgres/`: Drizzle schema, migrations, repositories, unit of work, outbox.
- `src/<provider>/`: one folder per provider (`supabase`, `resend`, `stripe`, `pgmq`, `turnstile`).
- `test/contracts/`: one contract suite per port, run against memory and real.

## Database

- The application talks to Postgres through Drizzle over the Supabase pooler with a dedicated role. Never through supabase-js.
- Repositories require a tenant context to be constructed and add the tenant filter to every statement.
- Row level security stays enabled as a second barrier, with the tenant set per connection.
- Rows are mapped to entities inside this package. Rows never leave it.
- `createPostgresClient` disables prepared statements because the Supabase transaction pooler does not keep them between transactions. The tenant is set per transaction with `set_config(..., true)`, never with session level `SET`; see decision 0007.
- Every repository statement runs inside a transaction. `runInTransaction` reuses the transaction opened by `PostgresUnitOfWork` through `AsyncLocalStorage`, so a repository never receives a connection as a parameter.
- Two Postgres connections exist, never one: `DATABASE_URL` connects as `app_user`, the role the migrations create with `NOBYPASSRLS` and only `SELECT`, `INSERT`, `UPDATE` on the tenant tables; it is what repositories, the unit of work and `runInTransaction`'s row-level-security guard use. `DATABASE_ADMIN_URL` is a privileged, superuser-class connection used only as test and migration scaffolding, never by application code. `app_user` intentionally has no `TRUNCATE` or `DELETE` grant: an application role that can empty its own tables in production is a worse failure mode than a slower test harness, and `TRUNCATE` bypasses row-level security entirely, so granting it would undermine the very isolation these repositories exist to enforce.
- Migrations live in `migrations/` and are applied by `bun run db:migrate` from this package, which reads `DATABASE_ADMIN_URL` in `scripts/db` (falling back to `DATABASE_URL` if only one connection is configured, e.g. a local database where you connect as its owner). Creating roles, granting privileges and enabling row level security all require privileges `app_user` must not have. `bun run db:generate -- --name <change>` writes a new migration from the schema; `bun run db:generate -- --custom --name <change>` prepares an empty file for hand written SQL.
- The contract suites in `test/postgres.test.ts` run only when both `DATABASE_URL` and `DATABASE_ADMIN_URL` are set; otherwise they skip with a message naming whichever is missing. Repositories under test connect through `DATABASE_URL` as `app_user`, so row level security is actually exercised; `DATABASE_ADMIN_URL` only migrates the schema once and truncates the tenant tables between tests. Point both at the same disposable database.

## Providers

- A provider client is built in main and injected. This package never reads configuration.
- Provider errors are translated to domain errors at the boundary.
- Every outbound call has a timeout.
