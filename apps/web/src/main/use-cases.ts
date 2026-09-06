import {
  createApiKey,
  createTenant,
  getTenantBySlug,
  registerUser,
  resolveActorFromApiKey,
  resolveActorFromSession,
  revokeApiKey,
  type RegisterUser,
  type ResolveActorFromApiKey,
  type ResolveActorFromSession,
} from "@base/application";
import {
  createApiKeyController,
  createTenantController,
  getTenantBySlugController,
  revokeApiKeyController,
  type CreateApiKeyController,
  type CreateTenantController,
  type GetTenantBySlugController,
  type RevokeApiKeyController,
} from "@base/adapters";
import { createContainer, type Container } from "./container";
import { env } from "./env";

let shared: Container | undefined;

function container(): Container {
  shared ??= createContainer(env);
  return shared;
}

export function sharedContainer(): Container {
  return container();
}

export function createTenantOperation(): CreateTenantController {
  const parts = container();
  return createTenantController(
    createTenant({
      tenants: parts.tenantRegistry,
      permissions: parts.permissions,
      clock: parts.clock,
      idGenerator: parts.idGenerator,
      unitOfWork: parts.unitOfWork,
      outbox: parts.outbox,
    }),
  );
}

export function getTenantBySlugOperation(): GetTenantBySlugController {
  const parts = container();
  return getTenantBySlugController(
    getTenantBySlug({ tenants: parts.tenantRegistry, permissions: parts.permissions }),
  );
}

export function resolveActorFromSessionOperation(): ResolveActorFromSession {
  const parts = container();
  return resolveActorFromSession({
    identityProvider: parts.identityProvider,
    memberships: parts.membershipRegistry,
    tenants: parts.tenantRegistry,
  });
}

export function resolveActorFromApiKeyOperation(): ResolveActorFromApiKey {
  const parts = container();
  return resolveActorFromApiKey({ apiKeys: parts.apiKeyRegistry, hasher: parts.apiKeyHasher });
}

export function createApiKeyOperation(): CreateApiKeyController {
  const parts = container();
  return createApiKeyController(
    createApiKey({
      apiKeysScopedTo: parts.apiKeysScopedTo,
      permissions: parts.permissions,
      clock: parts.clock,
      idGenerator: parts.idGenerator,
      secretGenerator: parts.secretGenerator,
      hasher: parts.apiKeyHasher,
      unitOfWork: parts.unitOfWork,
      outbox: parts.outbox,
    }),
  );
}

export function revokeApiKeyOperation(): RevokeApiKeyController {
  const parts = container();
  return revokeApiKeyController(
    revokeApiKey({
      apiKeysScopedTo: parts.apiKeysScopedTo,
      permissions: parts.permissions,
      clock: parts.clock,
      unitOfWork: parts.unitOfWork,
      outbox: parts.outbox,
    }),
  );
}

export function registerUserOperation(): RegisterUser {
  const parts = container();
  return registerUser({
    users: parts.userRegistry,
    memberships: parts.membershipRegistry,
    permissions: parts.permissions,
    clock: parts.clock,
    unitOfWork: parts.unitOfWork,
    outbox: parts.outbox,
  });
}
