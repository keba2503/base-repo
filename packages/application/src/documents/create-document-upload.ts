import { isErr, ok, type DomainError, type Result } from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { IdGenerator } from "../kernel/ports/id-generator";
import type { Permissions } from "../kernel/ports/permissions";
import { documentResource, documentUploadUrlExpiresInSeconds, uploadDocumentAction, type CreateDocumentUploadRequest, type CreateDocumentUploadResponse } from "./models";
import type { FileStore } from "./ports/file-store";

export type CreateDocumentUploadDependencies = {
  readonly fileStore: FileStore;
  readonly permissions: Permissions;
  readonly idGenerator: IdGenerator;
};

export type CreateDocumentUpload = (
  request: CreateDocumentUploadRequest,
) => Promise<Result<CreateDocumentUploadResponse, DomainError>>;

export function createDocumentUpload(dependencies: CreateDocumentUploadDependencies): CreateDocumentUpload {
  const { fileStore, permissions, idGenerator } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: uploadDocumentAction,
      resource: documentResource,
    });
    if (isErr(authorization)) return authorization;

    const storageKey = idGenerator.next();
    const tenantId = request.actor.tenantId;
    const uploadUrl = await fileStore.createUploadUrl({
      tenantId,
      storageKey,
      expiresInSeconds: documentUploadUrlExpiresInSeconds,
    });

    return ok({ storageKey, uploadUrl, expiresInSeconds: documentUploadUrlExpiresInSeconds });
  };
}
