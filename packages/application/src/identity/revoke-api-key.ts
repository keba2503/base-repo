import {
  err,
  isErr,
  notFound,
  ok,
  parseEntityId,
  type DomainError,
  type Result,
  type TenantId,
} from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { Clock } from "../kernel/ports/clock";
import type { Outbox } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import { apiKeyResource, manageApiKeysAction, type ApiKeyResponse, type RevokeApiKeyRequest } from "./models";
import type { ApiKeyRepository } from "./ports/api-key-repository";

export type RevokeApiKeyDependencies = {
  readonly apiKeysScopedTo: (tenantId: TenantId) => ApiKeyRepository;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: Outbox;
};

export type RevokeApiKey = (request: RevokeApiKeyRequest) => Promise<Result<ApiKeyResponse, DomainError>>;

const missingKey = notFound("apiKey.notFound", "No api key of this tenant has this id");

export function revokeApiKey(dependencies: RevokeApiKeyDependencies): RevokeApiKey {
  const { apiKeysScopedTo, permissions, clock, unitOfWork, outbox } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: manageApiKeysAction,
      resource: apiKeyResource,
    });
    if (isErr(authorization)) return authorization;

    const id = parseEntityId(request.apiKeyId);
    if (isErr(id)) return err(missingKey);

    const apiKeys = apiKeysScopedTo(request.actor.tenantId);
    const apiKey = await apiKeys.findById(id.value);
    if (!apiKey) return err(missingKey);

    const revoked = apiKey.revoke(clock.now());
    if (isErr(revoked)) return revoked;

    await unitOfWork.run(async () => {
      await apiKeys.save(apiKey);
      await outbox.enqueue(apiKey.pullEvents());
    });

    return ok({
      id: apiKey.id,
      tenantId: apiKey.tenantId,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      createdAt: apiKey.createdAt,
      revokedAt: apiKey.revokedAt,
    });
  };
}
