---
read-when: editing anything under apps/*/src/main
related: [../architecture/main, infrastructure, web]
---

# Main rules

The composition root. The only place allowed to read `process.env`, import implementations and decide which one satisfies each port.

- `env.ts`: one zod schema, parsed once, exported as typed configuration.
- `container.<environment>.ts`: one factory per environment building the object graph.
- `use-cases.ts`: functions that return ready to use controllers for views, actions and the API.

No logic beyond construction. If a decision here depends on business data, it belongs in a use case.
