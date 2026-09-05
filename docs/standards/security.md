---
read-when: touching authentication, authorization, input handling, headers, secrets, providers, or anything a user can send
related: [data-and-gdpr, ../architecture/main, ../layers/contracts, ../layers/infrastructure]
---

# Security

Security is distributed by ring. Putting a concern in the wrong ring is where holes appear.

| Concern | Ring | Mechanism |
| --- | --- | --- |
| Invariants | domain | entities refuse invalid state |
| Authorization | application | permissions port asked by every use case |
| Tenant isolation | infrastructure | tenant scoped repositories plus row level security |
| Input shape | adapters and contracts | zod schemas, allow list outputs |
| Human check, rate limit, idempotency | contracts metadata, enforced by delivery | Turnstile, buckets per credential |
| Transport | web | CSP with nonce, HSTS, frame ancestors none, permissions policy |
| Sessions and credentials | web and main | Supabase Auth sessions, hashed API keys, HttpOnly cookies |
| Secrets | main | validated once, injected, never logged |
| Supply chain | repository | bun lockfile, frozen installs, audit, zero dependencies in inner rings |

## Rules

- The browser never talks to Supabase or any provider. Every call goes through the server and a use case.
- Machine clients authenticate with API keys stored hashed. A key resolves to an actor with explicit scopes.
- Every outbound provider call has a timeout and a retry policy declared in main.
- Errors returned to clients carry a code and a safe message. Stack traces and provider messages stay in logs.
- Log redaction is driven by data classification. Fields marked personal never reach a log line.
- Uploads are validated by content, not by extension, size limited, stored outside the web root, served through signed URLs.
