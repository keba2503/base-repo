---
read-when: editing anything under apps/web
related: [../architecture/boundaries, ../architecture/main, ../standards/security, adapters]
---

# Web rules

Ring 4. Next.js is a delivery mechanism. It may import `@base/adapters`, `@base/contracts` and `@base/infrastructure`. It may import `@base/application` and `@base/domain` only inside `src/main`.

## Views

- Server Components and Client Components receive view models and render them. No fetching logic, no formatting, no business conditionals.
- A page obtains its view model by calling a controller through the factories in `src/main`, then passes it down.
- Styling with Tailwind utilities bound to the semantic tokens in `globals.css`. Palette and typography change in one `@theme` block.

## Server Actions and route handlers

- Parse the raw input, call the controller, map the outcome to a redirect, a revalidation or a response. Nothing else.
- The external API lives under `src/api` and is mounted at `/api/v1`. The UI never calls it.

## Security in this layer

- Security headers and the per request CSP nonce are set in `src/proxy.ts`.
- Cookies are HttpOnly, Secure, SameSite=Lax.
- Nothing from `@base/infrastructure` is imported by a Client Component.
