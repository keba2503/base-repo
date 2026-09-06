import { err, forbidden, isErr, ok, splitApiKey, type DomainError, type Result } from "@base/domain";
import type { Actor } from "../kernel/actor";
import type { ResolveActorFromApiKeyRequest } from "./models";
import type { ApiKeyHasher } from "./ports/api-key-hasher";
import type { ApiKeyRepository } from "./ports/api-key-repository";

export type ResolveActorFromApiKeyDependencies = {
  readonly apiKeys: ApiKeyRepository;
  readonly hasher: ApiKeyHasher;
};

export type ResolveActorFromApiKey = (
  request: ResolveActorFromApiKeyRequest,
) => Promise<Result<Actor, DomainError>>;

const invalidKey = forbidden("identity.apiKey.invalid", "This api key is not recognised");
const revokedKey = forbidden("identity.apiKey.revoked", "This api key was revoked");

export function resolveActorFromApiKey(
  dependencies: ResolveActorFromApiKeyDependencies,
): ResolveActorFromApiKey {
  const { apiKeys, hasher } = dependencies;

  return async (request) => {
    const parts = splitApiKey(request.key);
    if (isErr(parts)) return err(invalidKey);

    const apiKey = await apiKeys.findByPrefix(parts.value.keyPrefix);
    if (!apiKey) return err(invalidKey);

    const matches = await hasher.verify({ key: request.key, hash: apiKey.keyHash });
    if (!matches) return err(invalidKey);
    if (apiKey.isRevoked) return err(revokedKey);

    return ok({
      tenantId: apiKey.tenantId,
      subjectId: apiKey.id,
      kind: "apiKey",
      scopes: apiKey.scopes,
    });
  };
}
