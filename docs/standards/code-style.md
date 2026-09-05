---
read-when: writing any code
related: [../workflow/quality-gates, testing, ../architecture/dependency-rule]
---

# Code style

## Absolute rules

- No comments of any kind, anywhere: no line comments, no block comments, no JSDoc, no HTML comment markup, no JSX comment blocks, no hash lines in configuration. Names carry the meaning. The architecture check rejects them.
- No `any`. No type assertions to escape a type error.
- No `process.env` outside `src/main`.
- No default exports except where Next.js requires them.
- No barrel files except the single `index.ts` of each component and each package.

## Naming

- Files in kebab-case. Types in PascalCase. Functions and variables in camelCase. Constants that are configuration in camelCase too.
- A use case is a verb phrase: `confirmOrder`, `uploadDocument`.
- A port is a capability noun: `Mailer`, `DocumentStore`. An implementation is provider plus port: `ResendMailer`.
- A presenter is `present<Thing>`. A view model type is `<Thing>ViewModel`.
- Booleans read as questions: `isActive`, `canRefund`, `hasConsent`.

## Errors

- Business failures are values: `Result<T, DomainError>`. Never thrown.
- Only infrastructure throws, and only for things that are truly exceptional. The boundary translates them.

## Functions

- Early returns over nesting. Pure where possible. One level of abstraction per function.
- Parameters as a single object when there are more than two.
