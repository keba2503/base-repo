---
status: accepted
date: 2026-09-06
---

# 0019 Field-level encryption keys are rotated by keeping old ones, not by re-encrypting

## Context

`docs/standards/data-and-gdpr.md` requires classification to drive more than log redaction: fields classified `sensitive` should be unreadable at rest. This repository has exactly one such field today, `Document.extractedText` (`documentFieldClassifications.extractedText === "sensitive"`, the OCR/model output of an uploaded document, which can contain anything the source document contained). Three questions had to be settled before writing `AesGcmFieldCipher`: where the key lives and how it rotates without orphaning already-encrypted rows, whether encryption belongs in the repository or further in, and what a sensitive-and-encrypted field gives up.

## Decision

### Where the key lives, and rotation

`FieldCipher` (`packages/application/src/kernel/ports/field-cipher.ts`) is a port: `encrypt(plaintext): Promise<string>`, `decrypt(ciphertext): Promise<string>`. `AesGcmFieldCipher` (`packages/infrastructure/src/crypto/aes-gcm-field-cipher.ts`) is AES-256-GCM. The key is never read from `process.env` inside `packages/infrastructure` — per `docs/layers/main.md`, configuration is read once in `apps/*/src/main`. `FIELD_ENCRYPTION_KEYS` is a comma-separated list of `id:base64key` pairs; `container.ts` parses it into `FieldEncryptionKey[]` and constructs one `AesGcmFieldCipher` per process, shared by every repository that needs it.

Rotation keeps every previous key alongside the new one, and every ciphertext embeds which key encrypted it: the format is `v1:<keyId>:<ivBase64url>:<payloadBase64url>` (`aesGcmFieldCipherVersion`). `encrypt` always uses `keys[0]` (the first entry is "current" by convention — put the new key first when rotating). `decrypt` looks up `keyId` inside the full configured list and fails loudly if that key is not present (verified in `packages/infrastructure/test/crypto.test.ts`: "refuses to decrypt once the key it was encrypted with is retired"). This means rotation is: generate a new key, prepend it to `FIELD_ENCRYPTION_KEYS`, deploy — existing rows stay readable because their key is still in the list, and every new write uses the new key. There is no bulk re-encryption migration, and none is needed for correctness; a project that wants to shrink the list of retained keys over time does so by re-saving rows it cares about (the existing `save` path already re-encrypts under the current key on any write, since `PostgresDocumentRepository.save` always calls `cipher.encrypt` on the snapshot it is given) and only then dropping the old key from the list.

The trade-off this accepts: every retained old key is a key that can still decrypt old data, forever, until a project actively re-saves and drops it. This is the same shape decision 0007 made for row level security and decision 0015 made for the job queue — prefer an understood, simple gap over unproven machinery (an automatic re-encryption sweep) built before there is a real workload to size it against.

### Repository, not deeper

Encryption happens in `PostgresDocumentRepository` (`packages/infrastructure/src/postgres/documents/document-repository.ts`), not in the domain and not in the use case. `Document.extractedText` inside the aggregate is always plaintext — every domain rule, every use case, every test that builds a `Document` works with the real string. Only the boundary that actually writes bytes to a column encrypts them, and only the boundary that reads the column back decrypts before handing a `DocumentSnapshot` to `Document.restore`. This keeps `packages/domain` at zero dependencies (it cannot import `node:crypto` and must not need to) and keeps the memory implementation, `InMemoryDocumentRepository`, entirely unaware that encryption exists — it never touches a database column, so there is nothing at rest to protect, and the `DocumentRepository` contract suite (`describeDocumentRepositoryContract`) passes unchanged against both because encryption is invisible from the port's perspective by construction.

### What a `sensitive` field gives up

AES-GCM ciphertext is high-entropy and, by construction, cannot be compared, ordered, or searched by Postgres — `WHERE extracted_text LIKE '%...'`, `ORDER BY extracted_text`, and any index on the column all stop being meaningful the moment it is encrypted. This is not a limitation this decision works around; it is the reason `extractedText` was already the only field classified `sensitive` rather than `personal` in `packages/domain/src/documents/document.ts`: nothing in this codebase queries or sorts by extracted document text today, and the classification a future `sensitive` field is given should be chosen with this in mind. A field a use case genuinely needs to search or sort by is a sign it should be classified `personal` (redacted from logs, included in export, but stored in the clear) or restructured so the searchable part (a hash, a bucketed value, a separate non-sensitive summary column) is not itself the sensitive payload. This repository does not solve "encrypted and searchable" — that requires deterministic or order-preserving encryption with materially weaker guarantees, or a separate search index, and inventing either without a real field that needs it would be exactly the unproven machinery decision 0015 warns against.

## Consequences

- `PostgresDocumentRepository`'s constructor takes a `FieldCipher` (`packages/infrastructure/test/postgres.test.ts` verifies against a real Postgres instance that the raw `extracted_text` column is unreadable while `findById` still returns the original plaintext through the port).
- `apps/web/src/main/container.ts` and `apps/worker/src/main/container.ts` both build the cipher the same way (`fieldCipherFor`): `InMemoryFieldCipher` in `test`, a random ephemeral key in `development` when `FIELD_ENCRYPTION_KEYS` is unset (data does not survive a restart, which is acceptable for a disposable local database and unacceptable in production, so `FIELD_ENCRYPTION_KEYS` is required there), and the configured, rotatable key list otherwise.
- Adding a second `sensitive` field later means passing the same `FieldCipher` into whichever repository owns it; the port and the key management story do not change per field.
