---
read-when: writing a controller, presenter, server action, route handler or view
related: [dependency-rule, ../layers/adapters, ../layers/web]
---

# Boundaries and the humble view

Control flows Controller → Use case → Presenter → View. Source dependencies all point at the use case.

## Controller

Lives in `packages/adapters`. Receives plain input already parsed by the delivery mechanism, validates it against a contract from `packages/contracts`, builds a request model and calls the use case. Maps the use case result to a plain outcome the delivery mechanism can render or serialise. Knows nothing about HTTP, FormData or React.

## Presenter

Lives in `packages/adapters`. Turns a response model into a view model: strings already formatted for the locale, flags that tell the view what to show or disable, labels for actions. Pure function, tested without a browser.

## View

Lives in `apps/web`. A Server Component or Client Component that moves data from a view model into markup. It formats nothing and decides nothing. If a view contains a conditional on business data, that decision belongs in the presenter.

## Delivery mechanisms in `apps/web`

- Server Actions and route handlers are thin: parse the raw input, call the controller, return or redirect.
- The UI never calls the HTTP API of its own server. It calls controllers directly.
- The external API under `/api/v1` is a separate delivery mechanism for machines. It shares controllers and contracts with the UI.

## Email and documents are views

An email template and a PDF template are views. They receive a view model from a presenter and render it. No formatting logic inside templates.
