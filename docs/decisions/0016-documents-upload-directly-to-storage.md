---
status: accepted
date: 2026-09-06
---

# 0016 A document is uploaded directly to storage, never through the API body

## Context

The first version of document upload accepted the file as base64 inside the JSON body of `POST /v1/documents`, exactly like every other write in this repository. The contract advertised a 20MB limit, which as base64 is close to 27MB of request body. This repository targets Vercel (`README.md`), and Vercel Functions cap the request body of a function at 4.5MB regardless of plan. A 20MB upload would never reach a single line of this codebase: the platform would answer `413 FUNCTION_PAYLOAD_TOO_LARGE` first. Advertising 20MB in the contract while the platform silently refused anything past 4.5MB would have been a documented lie, and the base64 detour also meant holding the whole file in memory twice (the encoded string and the decoded bytes) just to reject most of it.

`FileStore` already had `createDownloadUrl` for reading a file without the API proxying its bytes. The same idea applies to writing one.

## Decision

Uploading a document is two calls, not one:

1. `POST /v1/documents/upload-urls` (`createDocumentUpload`, contract `documents.createUpload`) authorizes the actor, generates the storage key with `IdGenerator` exactly like every other identifier in this repository, and asks `FileStore.createUploadUrl` for a short-lived signed URL scoped to that key under the actor's tenant. It creates nothing: no `Document`, no row, no job. It returns `{ storageKey, uploadUrl, expiresInSeconds }`.
2. The caller `PUT`s the file straight to `uploadUrl`. This request never touches a Vercel Function; it goes to Supabase Storage directly, so the 4.5MB body limit does not apply to it.
3. `POST /v1/documents` (`confirmDocumentUpload`, contract `documents.confirmUpload`) takes `{ storageKey, filename }`, reads back the bytes that actually landed in storage with `FileStore.read`, sniffs the real content type from those bytes exactly as before (this did not move, only its trigger did), measures the real size from the buffer length, and only now constructs `Document.create(...)`. This is also the point that persists the aggregate, enqueues its events and enqueues the `documents.process` job — the confirmation *is* the creation, there is no separate persisted "pending upload" state in the domain to keep the state machine in `docs/decisions/0015-own-job-queue-table-not-pgmq.md`'s spirit of one file, one clear machine.

If the sniffed content type is unsupported or `Document.create` rejects the snapshot (bad filename, size over the limit), `confirmDocumentUpload` calls `FileStore.remove` on the object before returning the error, so an invalid upload does not linger in storage under a key nobody will ever reference again.

### What happens if nobody confirms

A caller can request an upload URL, upload nothing, or upload something and never call confirm. Because step 1 persists nothing, this leaves at most an orphaned object in Supabase Storage — never an orphaned `Document`, an orphaned job, or a row for another tenant to trip over. This is a deliberate, accepted gap for this wave, not an oversight:

- The signed URL Supabase issues from `createSignedUploadUrl` already expires on its own (a few hours, not configurable through this client version), so an abandoned upload attempt cannot be used to write data forever.
- Nothing yet reconciles "objects in the bucket with no matching `documents` row" and deletes them. A scheduled job doing that sweep is future work, tracked here rather than guessed at: it is the same shape as the retention jobs `docs/standards/data-and-gdpr.md` already describes for personal data, and should be built alongside those, not invented ad hoc for this one case.
- This trade-off mirrors the one this repository already accepted for the outbox and the job queue in 0015: a small, understood, worker-driven cleanup gap is preferable to solving it with unproven machinery before there is a real workload to size it against.

## The service role key and where storage isolation actually lives

`SupabaseFileStore` is constructed in both `apps/web/src/main/container.ts` and `apps/worker/src/main/container.ts` with a Supabase client authenticated with `SUPABASE_SERVICE_ROLE_KEY`, not the anonymous key `SupabaseIdentityProvider` uses. This is the standard pattern for server-side object storage access — signing an upload or download URL, or reading/removing an object outside of a user's own session, requires a key that bypasses Supabase's row-level-security-equivalent for Storage (its bucket policies), because the server is acting on behalf of a tenant it authenticated itself, not relaying a user's own Storage session.

Write this down plainly because it is easy to forget once the key is just another environment variable: **that key bypasses tenant isolation completely.** Any code holding this Supabase client can read or overwrite any object in the bucket for any tenant; there is no row-level-security barrier in Supabase Storage the way there is in Postgres. The only isolation between tenants in storage is the path prefix `SupabaseFileStore` composes itself — `${tenantId}/${storageKey}` — inside `#pathOf`, from a `tenantId` its caller passes in.

The consequence that follows, and the reason `SupabaseFileStore` composes that prefix internally instead of accepting a pre-built path: **the tenant id must always come from the authenticated actor inside a use case, never from anything a client sends.** `createDocumentUpload` and `confirmDocumentUpload` both read `request.actor.tenantId`, which `resolveActorFromSession`/`resolveActorFromApiKey` derived from a verified session or key — never from a request body or query string. If a future caller ever passed a client-supplied tenant id into `FileStore`, the service-role key would honour it without complaint, and one tenant could read or overwrite another tenant's documents. This is exactly analogous to a `TenantRepository` built with `{ kind: "registry" }` scope: the object is only as safe as the code that decides which tenant to hand it, because the object itself will not stop you.

## Consequences

- The contract's advertised limits are now real: `documents.createUpload` and `documents.confirmUpload` bodies are tiny (an empty object, and `{ storageKey, filename }`), so the 4.5MB Vercel Function body limit is irrelevant to either of them, and the actual file transfer bypasses Vercel Functions entirely.
- The magic-byte content sniffing, the size ceiling, and the "the client's filename never becomes a path" rule from the first version are all unchanged in substance; they simply run when `confirmDocumentUpload` reads the object back, instead of when the (now deleted) single-call `uploadDocument` decoded a body.
- `FileStore.save` remains part of the port (used by `PostgresDocumentRepository`'s sibling use cases are free to write files programmatically, and by every test double), but the human upload path no longer calls it — `save` and the presigned-URL pair now serve different callers.
- No UI was built this wave to actually perform the two-step upload from a browser (there is no page under `apps/web/src/app` for documents at all yet); this decision describes the contract and controller shape a future page or script must follow.
