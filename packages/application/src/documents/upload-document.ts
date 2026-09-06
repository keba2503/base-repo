import {
  Document,
  err,
  invariantViolation,
  isErr,
  ok,
  type DomainError,
  type Result,
  type TenantId,
} from "@base/domain";
import { documentResponseOf } from "./document-response";
import { authorize } from "../kernel/authorize";
import type { Clock } from "../kernel/ports/clock";
import type { IdGenerator } from "../kernel/ports/id-generator";
import type { JobQueue } from "../kernel/ports/job-queue";
import type { Outbox } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import { documentProcessJobName, documentResource, uploadDocumentAction, type DocumentResponse, type UploadDocumentRequest } from "./models";
import type { DocumentRepository } from "./ports/document-repository";
import type { FileStore } from "./ports/file-store";
import { sniffContentType } from "./sniff-content-type";

export type UploadDocumentDependencies = {
  readonly documentsScopedTo: (tenantId: TenantId) => DocumentRepository;
  readonly fileStore: FileStore;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: Outbox;
  readonly jobsScopedTo: (tenantId: TenantId) => JobQueue;
};

export type UploadDocument = (request: UploadDocumentRequest) => Promise<Result<DocumentResponse, DomainError>>;

function decodeBase64(content: string): Result<Uint8Array, DomainError> {
  try {
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return ok(bytes);
  } catch {
    return err(invariantViolation("document.content.malformed", "The document content is not valid base64"));
  }
}

export function uploadDocument(dependencies: UploadDocumentDependencies): UploadDocument {
  const { documentsScopedTo, fileStore, permissions, clock, idGenerator, unitOfWork, outbox, jobsScopedTo } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: uploadDocumentAction,
      resource: documentResource,
    });
    if (isErr(authorization)) return authorization;

    const decoded = decodeBase64(request.base64Content);
    if (isErr(decoded)) return decoded;
    const bytes = decoded.value;

    const contentType = sniffContentType(bytes);
    if (!contentType) {
      return err(
        invariantViolation("document.contentType.unsupported", "The document content does not match a supported file type"),
      );
    }

    const id = idGenerator.next();
    const storageKey = id;
    const tenantId = request.actor.tenantId;

    const created = Document.create({
      id,
      tenantId,
      uploadedBy: request.actor.subjectId,
      originalFilename: request.filename,
      storageKey,
      contentType,
      sizeBytes: bytes.length,
      createdAt: clock.now(),
    });
    if (isErr(created)) return created;

    const document = created.value;
    const documents = documentsScopedTo(tenantId);
    const jobs = jobsScopedTo(tenantId);
    await unitOfWork.run({ kind: "tenant", tenantId }, async () => {
      await fileStore.save({ tenantId, storageKey, contentType, bytes });
      await documents.save(document);
      await outbox.enqueue(document.pullEvents());
      await jobs.enqueue({ tenantId, name: documentProcessJobName, payload: { documentId: document.id } });
    });

    return ok(documentResponseOf(document));
  };
}
