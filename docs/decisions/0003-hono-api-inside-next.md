---
status: accepted
date: 2026-09-05
---

# 0003 External API with Hono inside Next.js

## Context

Every project must expose its use cases to machines: an MCP server, integrations, future services. The UI must not pay a network round trip to its own server.

## Decision

Contracts in `packages/contracts` are the source of validation and OpenAPI. Hono is mounted in a catch-all route handler under `/api/v1` and serves Swagger at `/api/docs`. The UI calls controllers directly through Server Actions. Machines authenticate with hashed API keys.

## Consequences

- The API can be lifted out of Next.js into its own service without rewriting handlers.
- One contract feeds validation, documentation and typed clients.
- Hono is a framework in the outer ring; nothing inside knows it exists.
