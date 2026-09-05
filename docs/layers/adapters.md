---
read-when: editing anything under packages/adapters
related: [../architecture/boundaries, contracts, ../layers/web]
---

# Adapters rules

Ring 3. Depends on `@base/application`, `@base/domain`, `@base/contracts`. External: zod. Never next, react, drizzle, supabase, hono.

## Controllers

- Accept already parsed plain input, validate it with a contract, build the request model, call the use case, map the `Result` to a plain outcome.
- Do not know about HTTP status codes. They return outcome kinds (`ok`, `invalid`, `forbidden`, `notFound`, `conflict`) that delivery mechanisms map to their own vocabulary.

## Presenters

- Pure functions from response model and locale to view model.
- View models contain strings, booleans and lists of the same. No dates, no money objects, no entities.
- Every label a view shows comes from the presenter.

## Mappers

- Contract to request model and response model to contract output. Nothing else.
