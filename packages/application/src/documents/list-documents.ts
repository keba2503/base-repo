import { isErr, ok, type DomainError, type Result, type TenantId } from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { Permissions } from "../kernel/ports/permissions";
import { documentResource, readDocumentsAction, type ListDocumentsRequest, type ListDocumentsResponse } from "./models";
import { documentResponseOf } from "./document-response";
import type { DocumentRepository } from "./ports/document-repository";

export type ListDocumentsDependencies = {
  readonly documentsScopedTo: (tenantId: TenantId) => DocumentRepository;
  readonly permissions: Permissions;
};

export type ListDocuments = (request: ListDocumentsRequest) => Promise<Result<ListDocumentsResponse, DomainError>>;

export function listDocuments(dependencies: ListDocumentsDependencies): ListDocuments {
  const { documentsScopedTo, permissions } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: readDocumentsAction,
      resource: documentResource,
    });
    if (isErr(authorization)) return authorization;

    const documents = documentsScopedTo(request.actor.tenantId);
    const found = await documents.list({ limit: request.limit });
    return ok({ documents: found.map(documentResponseOf) });
  };
}
