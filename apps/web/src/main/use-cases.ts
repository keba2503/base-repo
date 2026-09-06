import {
  createApiKey,
  createTenant,
  getDocument,
  getTenantBySlug,
  listDocuments,
  registerUser,
  resolveActorFromApiKey,
  resolveActorFromSession,
  revokeApiKey,
  uploadDocument,
  type RegisterUser,
  type ResolveActorFromApiKey,
  type ResolveActorFromSession,
} from "@base/application";
import {
  createApiKeyController,
  createTenantController,
  getDocumentController,
  getTenantBySlugController,
  listDocumentsController,
  revokeApiKeyController,
  uploadDocumentController,
  type CreateApiKeyController,
  type CreateTenantController,
  type GetDocumentController,
  type GetTenantBySlugController,
  type ListDocumentsController,
  type RevokeApiKeyController,
  type UploadDocumentController,
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
    getTenantBySlug({ tenantsScopedTo: parts.tenantsScopedTo, permissions: parts.permissions }),
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

export function uploadDocumentOperation(): UploadDocumentController {
  const parts = container();
  return uploadDocumentController(
    uploadDocument({
      documentsScopedTo: parts.documentsScopedTo,
      fileStore: parts.fileStore,
      permissions: parts.permissions,
      clock: parts.clock,
      idGenerator: parts.idGenerator,
      unitOfWork: parts.unitOfWork,
      outbox: parts.outbox,
      jobsScopedTo: parts.jobsScopedTo,
    }),
  );
}

export function getDocumentOperation(): GetDocumentController {
  const parts = container();
  return getDocumentController(
    getDocument({ documentsScopedTo: parts.documentsScopedTo, permissions: parts.permissions }),
  );
}

export function listDocumentsOperation(): ListDocumentsController {
  const parts = container();
  return listDocumentsController(
    listDocuments({ documentsScopedTo: parts.documentsScopedTo, permissions: parts.permissions }),
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
