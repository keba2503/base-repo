---
read-when: writing or reviewing tests, adding a port, touching CI
related: [../workflow/new-port, ../architecture/ports, ../workflow/quality-gates]
---

# Testing

Tests are the outermost ring. They depend on everything; nothing depends on them.

## Kinds and where they live

| Kind | Lives in | Runs against | Runner |
| --- | --- | --- | --- |
| Domain | `packages/domain/test` | entities and value objects | bun test |
| Use case | `packages/application/test` | use cases with memory ports | bun test |
| Presenter and controller | `packages/adapters/test` | pure functions | bun test |
| Contract | `packages/infrastructure/test/contracts` | every port, memory and real | bun test |
| End to end | `apps/web/e2e` | the running application | Playwright |
| Load | `scripts/load` | preview deployments | k6 |

## Rules

- A use case test never touches a database, a network or the file system.
- Test names describe behaviour: `rejects an order without lines`, not `test1`.
- One assertion subject per test. Several assertions about the same subject are fine.
- Fixtures are built through factories in `test/factories`, never copied literals.
- Contract suites are the specification of a port. A real implementation that fails them is wrong, not the suite.
- Structural coupling is avoided: tests call public entry points, never internals.
