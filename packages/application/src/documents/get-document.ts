import { err, isErr, notFound, ok, parseEntityId, type DomainError, type Result, type TenantId } from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { Permissions } from "../kernel/ports/permissions";
import { documentResource, readDocumentsAction, type DocumentResponse, type GetDocumentRequest } from "./models";
import { documentResponseOf } from "./document-response";
import type { DocumentRepository } from "./ports/document-repository";

export type GetDocumentDependencies = {
  readonly documentsScopedTo: (tenantId: TenantId) => DocumentRepository;
  readonly permissions: Permissions;
};

export type GetDocument = (request: GetDocumentRequest) => Promise<Result<DocumentResponse, DomainError>>;

const missingDocument = notFound("document.notFound", "No document of this tenant has this id");

export function getDocument(dependencies: GetDocumentDependencies): GetDocument {
  const { documentsScopedTo, permissions } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: readDocumentsAction,
      resource: documentResource,
    });
    if (isErr(authorization)) return authorization;

    const id = parseEntityId(request.documentId);
    if (isErr(id)) return err(missingDocument);

    const documents = documentsScopedTo(request.actor.tenantId);
    const document = await documents.findById(id.value);
    if (!document) return err(missingDocument);

    return ok(documentResponseOf(document));
  };
}
