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

## Providers

- A provider client is built in main and injected. This package never reads configuration.
- Provider errors are translated to domain errors at the boundary.
- Every outbound call has a timeout.
