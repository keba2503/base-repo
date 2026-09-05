---
read-when: editing anything under packages/application
related: [../architecture/ports, ../architecture/boundaries, domain, ../workflow/new-feature]
---

# Application rules

Ring 2. Depends on `@base/domain` only. No external dependencies.

## What lives here

- Use cases: one class or function per operation a user or system performs. Input is a request model, output is a `Result` of a response model or a domain error.
- Ports: interfaces the use cases need from the outside world.
- Request and response models: plain structures. Never derived from HTTP, FormData or framework types.
- Authorization: the use case asks the permissions port whether the actor may perform this operation on this resource, before touching anything.
- Domain event dispatch: use cases collect events from entities and hand them to the outbox port inside the unit of work.

## Shape of a use case

1. Authorize the actor.
2. Load what is needed through ports, always tenant scoped.
3. Let entities apply their rules.
4. Persist through the unit of work.
5. Return a response model.

## Rules

- No formatting for humans. No locale. No strings meant for screens.
- No transaction handling inline: use the unit of work port.
- Every use case has a test that runs against memory implementations only.
