---
status: accepted
date: 2026-09-11
---

# 0033 The anonymization token is random, superseding the deterministic one in 0018

## Context

Decision 0018 fixed the token an erasure writes into an anonymized record as `erased-${subjectId}`, deterministic and explicitly "not a secret". A full review of the repository found that property to be the defect: a token derived from the identifier it replaces is reversible by construction, so anyone holding the anonymized row can recover the subject identifier and re-link the record to the person it was supposed to stop pointing at. The retention sweep carried the same shape in `expired-${subjectId}`, and the export storage key embedded the subject identifier verbatim, so two exports of the same subject were correlatable by name alone.

## Decision

Every anonymization token and every export reference is now drawn from the `IdGenerator` port: a random identifier with no relation to the subject it replaces. `anonymizationTokenFor(tokens)` in the erasure executor, the retention sweep, and the export storage key all take the token from the same generator, so a record anonymized by either path carries the same kind of opaque value and one format does not drift from the other.

## Consequences

This supersedes decision 0018 on the shape of the token; the rest of 0018 — anonymization as the erasure mechanism, the audit trail surviving it — stands. Anonymized rows can no longer be re-linked to a subject by computation, which is what the erasure promises. The cost is that the token is no longer reproducible from the subject identifier: an operator who needs to prove that a given row was anonymized for a given subject can no longer recompute the token, and must rely on the audit trail the erasure writes instead. The export storage key gains the same property: two exports of the same subject no longer share a correlatable prefix.