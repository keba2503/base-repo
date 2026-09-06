import {
  ApiKey,
  apiKeyPrefixOf,
  composeApiKey,
  err,
  forbidden,
  invariantViolation,
  isErr,
  isPermissionAction,
  ok,
  type DomainError,
  type PermissionAction,
  type Result,
  type TenantId,
} from "@base/domain";
import type { Actor } from "../kernel/actor";
import { authorize } from "../kernel/authorize";
import type { Clock } from "../kernel/ports/clock";
import type { IdGenerator } from "../kernel/ports/id-generator";
import type { Outbox } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import {
  apiKeyResource,
  manageApiKeysAction,
  type ApiKeyCreatedResponse,
  type CreateApiKeyRequest,
} from "./models";
import type { ApiKeyHasher } from "./ports/api-key-hasher";
import type { ApiKeyRepository } from "./ports/api-key-repository";
import type { SecretGenerator } from "./ports/secret-generator";

export type CreateApiKeyDependencies = {
  readonly apiKeysScopedTo: (tenantId: TenantId) => ApiKeyRepository;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly secretGenerator: SecretGenerator;
  readonly hasher: ApiKeyHasher;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: Outbox;
};

export type CreateApiKey = (
  request: CreateApiKeyRequest,
) => Promise<Result<ApiKeyCreatedResponse, DomainError>>;

function knownScopes(scopes: readonly string[]): Result<readonly PermissionAction[], DomainError> {
  const unknown = scopes.find((scope) => !isPermissionAction(scope));
  if (unknown !== undefined) {
    return err(invariantViolation("apiKey.scopes.unknown", "An api key scope must be a known permission action"));
  }
  return ok(scopes.filter(isPermissionAction));
}

async function authorizeScopes(
  permissions: Permissions,
  actor: Actor,
  scopes: readonly PermissionAction[],
): Promise<Result<void, DomainError>> {
  for (const scope of scopes) {
    const allowed = await permissions.can({ actor, action: scope, resource: apiKeyResource });
    if (!allowed) {
      return err(
        forbidden("apiKey.scopes.escalation", `The actor may not grant the scope ${scope} it does not hold`),
      );
    }
  }
  return ok(undefined);
}

export function createApiKey(dependencies: CreateApiKeyDependencies): CreateApiKey {
  const { apiKeysScopedTo, permissions, clock, idGenerator, secretGenerator, hasher, unitOfWork, outbox } =
    dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: manageApiKeysAction,
      resource: apiKeyResource,
    });
    if (isErr(authorization)) return authorization;

    const scopes = knownScopes(request.scopes);
    if (isErr(scopes)) return scopes;

    const grantable = await authorizeScopes(permissions, request.actor, scopes.value);
    if (isErr(grantable)) return grantable;

    const id = idGenerator.next();
    const keyPrefix = apiKeyPrefixOf(id);
    const plaintextKey = composeApiKey({ keyPrefix, secret: secretGenerator.next() });
    const keyHash = await hasher.hash({ key: plaintextKey });

    const created = ApiKey.create({
      id,
      tenantId: request.actor.tenantId,
      name: request.name,
      keyPrefix,
      keyHash,
      scopes: scopes.value,
      createdAt: clock.now(),
    });
    if (isErr(created)) return created;

    const apiKey = created.value;
    const apiKeys = apiKeysScopedTo(request.actor.tenantId);
    await unitOfWork.run({ kind: "tenant", tenantId: request.actor.tenantId }, async () => {
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
      plaintextKey,
    });
  };
}
