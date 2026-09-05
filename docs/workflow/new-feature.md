---
read-when: adding or changing any functionality
related: [../architecture/dependency-rule, new-port, quality-gates, ../standards/testing]
---

# Adding functionality

Always in this order. The order is the dependency rule turned into a procedure: inner rings first, each step tested before the next.

1. Domain. Add or change the entity, value object, event or error. Test the invariants.
2. Use case. Write the request model, the response model and the use case. Declare any missing port. Test with memory implementations only.
3. Port. If a new port was declared, follow `new-port.md` before continuing.
4. Contract. Declare the operation in `packages/contracts` with its metadata.
5. Adapter. Controller and presenter, tested as pure functions.
6. Delivery. Server Action or route handler, API route, view. Wire in `src/main`.
7. Migration. If the schema changed, write the Drizzle migration and update the contract tests.

## Never

- Start from the view and work inward.
- Put a field in a view model that the presenter did not produce.
- Add a query to a repository that no use case calls.
- Skip the memory implementation because the real one already exists.

## Done means

`bun run check` green, contract tests green for new ports, a decision record if a tradeoff was made.
