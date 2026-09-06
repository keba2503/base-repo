import type { Actor } from "./dependencies";
import { failure, type ApiFailure } from "./failure";
import { fingerprintOf } from "./fingerprint";
import type { IdempotencyRecord, IdempotencyStore, IdempotentReply } from "./ports";

export const idempotencyKeyHeader = "Idempotency-Key";
export const idempotencyReplayedHeader = "Idempotency-Replayed";

const acceptedKey = /^[A-Za-z0-9._:-]{1,255}$/;

export type IdempotencyLookup =
  | { readonly kind: "fresh"; readonly record: (reply: IdempotentReply) => IdempotencyRecord }
  | { readonly kind: "replay"; readonly reply: IdempotentReply }
  | { readonly kind: "refused"; readonly reason: ApiFailure }
  | { readonly kind: "notRequested" };

export function idempotencyScopeOf(operationId: string, actor: Actor): string {
  return `${operationId}:${actor.tenantId}:${actor.subjectId}`;
}

export async function lookupIdempotency(request: {
  readonly key: string | undefined;
  readonly operationId: string;
  readonly actor: Actor;
  readonly rawBody: string;
  readonly store: IdempotencyStore;
}): Promise<IdempotencyLookup> {
  const key = request.key?.trim();
  if (key === undefined || key.length === 0) return { kind: "notRequested" };
  if (!acceptedKey.test(key)) {
    return {
      kind: "refused",
      reason: failure(422, "idempotency.keyInvalid", `${idempotencyKeyHeader} must be 1 to 255 characters of letters, digits, dots, colons, hyphens or underscores`),
    };
  }

  const scope = idempotencyScopeOf(request.operationId, request.actor);
  const fingerprint = await fingerprintOf(request.rawBody);
  const stored = await request.store.find({ scope, key });

  if (stored === undefined) {
    return { kind: "fresh", record: (reply) => ({ scope, key, fingerprint, reply }) };
  }
  if (stored.fingerprint !== fingerprint) {
    return {
      kind: "refused",
      reason: failure(422, "idempotency.payloadMismatch", `${idempotencyKeyHeader} was already used with a different payload`),
    };
  }
  return { kind: "replay", reply: stored.reply };
}
