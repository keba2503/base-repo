import {
  confirmDocumentUpload,
  createApiKey,
  createDocumentUpload,
  createTenant,
  dispatchJobs,
  dispatchOutbox,
  executorRegistry,
  getDocument,
  getTenantBySlug,
  grantConsent,
  handlerRegistry,
  hasActiveConsent,
  listAuditEntries,
  listDocuments,
  processDocument,
  registerUser,
  resolveActorFromApiKey,
  resolveActorFromSession,
  revokeApiKey,
  sendTenantWelcome,
  withdrawConsent,
  type Actor as ApplicationActor,
  type DispatchJobsResponse,
  type DispatchOutboxResponse,
  type GrantConsent,
  type HasActiveConsent,
  type ListAuditEntries,
  type MailMessage,
  type RegisterUser,
  type ResolveActorFromApiKey,
  type ResolveActorFromSession,
  type TenantResponse,
  type WithdrawConsent,
} from "@base/application";
import { isOk } from "@base/domain";
import { ScopedPermissions } from "@base/infrastructure";
import {
  confirmDocumentUploadController,
  createApiKeyController,
  createDocumentUploadController,
  createTenantController,
  getDocumentController,
  getTenantBySlugController,
  listDocumentsController,
  presentTenantWelcomeEmail,
  renderEmail,
  revokeApiKeyController,
  type ConfirmDocumentUploadController,
  type CreateApiKeyController,
  type CreateDocumentUploadController,
  type CreateTenantController,
  type GetDocumentController,
  type GetTenantBySlugController,
  type ListDocumentsController,
  type RevokeApiKeyController,
} from "@base/adapters";
import { isModuleActive } from "../../../../architecture/modules";
import { createContainer, dispatchPersistenceOf, type Container } from "./container";
import { env, type Environment } from "./env";

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
      auditScopedTo: parts.auditScopedTo,
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
      auditScopedTo: parts.auditScopedTo,
      permissions: parts.permissions,
      clock: parts.clock,
      unitOfWork: parts.unitOfWork,
      outbox: parts.outbox,
    }),
  );
}

export function createDocumentUploadOperation(): CreateDocumentUploadController {
  const parts = container();
  return createDocumentUploadController(
    createDocumentUpload({
      fileStore: parts.fileStore,
      permissions: parts.permissions,
      idGenerator: parts.idGenerator,
    }),
  );
}

export function confirmDocumentUploadOperation(): ConfirmDocumentUploadController {
  const parts = container();
  return confirmDocumentUploadController(
    confirmDocumentUpload({
      documentsScopedTo: parts.documentsScopedTo,
      fileStore: parts.fileStore,
      permissions: parts.permissions,
      clock: parts.clock,
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

const scopedPermissions = new ScopedPermissions();

export function grantConsentOperation(): GrantConsent {
  const parts = container();
  return grantConsent({
    consentsScopedTo: parts.consentsScopedTo,
    auditScopedTo: parts.auditScopedTo,
    permissions: scopedPermissions,
    clock: parts.clock,
    idGenerator: parts.idGenerator,
    unitOfWork: parts.unitOfWork,
    outbox: parts.outbox,
  });
}

export function withdrawConsentOperation(): WithdrawConsent {
  const parts = container();
  return withdrawConsent({
    consentsScopedTo: parts.consentsScopedTo,
    auditScopedTo: parts.auditScopedTo,
    permissions: scopedPermissions,
    clock: parts.clock,
    unitOfWork: parts.unitOfWork,
    outbox: parts.outbox,
  });
}

export function hasActiveConsentOperation(): HasActiveConsent {
  const parts = container();
  return hasActiveConsent({
    consentsScopedTo: parts.consentsScopedTo,
    permissions: scopedPermissions,
  });
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

export function listAuditEntriesOperation(): ListAuditEntries {
  const parts = container();
  return listAuditEntries({
    auditScopedTo: parts.auditScopedTo,
    permissions: scopedPermissions,
  });
}

function presentWelcomeMessage(environment: Environment): (response: TenantResponse) => MailMessage {
  return (response) => {
    const viewModel = presentTenantWelcomeEmail({
      response,
      locale: environment.defaultLocale,
      appUrl: environment.appUrl,
    });
    const { html, text } = renderEmail(viewModel);
    return {
      to: environment.mailWelcomeTo,
      subject: viewModel.subject,
      html,
      text,
      tags: { category: "tenant-welcome" },
    };
  };
}

export type DispatchBatchOutcome =
  | { readonly refused: false; readonly counts: DispatchOutboxResponse }
  | { readonly refused: true; readonly code: string };

export function dispatchOutboxOperation() {
  const parts = container();
  const handlers = handlerRegistry(
    isModuleActive("notifications")
      ? [
          sendTenantWelcome({
            tenants: parts.tenantRegistry,
            mailer: parts.mailer,
            presentMessage: presentWelcomeMessage(env),
          }),
        ]
      : [],
  );
  const dispatch = dispatchOutbox({
    outbox: dispatchPersistenceOf(parts).outbox,
    handlers,
    permissions: parts.permissions,
    logger: parts.logger,
  });

  return async (actor: ApplicationActor, limit: number, maxAttempts: number): Promise<DispatchBatchOutcome> => {
    const result = await dispatch({ actor, limit, maxAttempts });
    if (!isOk(result)) return { refused: true, code: result.error.code };
    return { refused: false, counts: result.value };
  };
}

export type DispatchJobsOutcome =
  | { readonly refused: false; readonly counts: DispatchJobsResponse }
  | { readonly refused: true; readonly code: string };

export function dispatchJobsOperation() {
  const parts = container();
  const dispatch = dispatchJobs({
    jobs: dispatchPersistenceOf(parts).jobQueue,
    executors: executorRegistry(
      isModuleActive("documents")
        ? [
            processDocument({
              documentsScopedTo: (tenantId) => parts.documentsScopedTo(tenantId),
              fileStore: parts.fileStore,
              processor: parts.documentProcessor,
              clock: parts.clock,
              unitOfWork: parts.unitOfWork,
            }),
          ]
        : [],
    ),
    permissions: parts.permissions,
    logger: parts.logger,
    clock: parts.clock,
    telemetry: parts.telemetry,
  });

  return async (actor: ApplicationActor, limit: number): Promise<DispatchJobsOutcome> => {
    const result = await dispatch({ actor, limit });
    if (!isOk(result)) return { refused: true, code: result.error.code };
    return { refused: false, counts: result.value };
  };
}
