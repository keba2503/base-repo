import {
  Document,
  err,
  invariantViolation,
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
import type { JobQueue } from "../kernel/ports/job-queue";
import type { OutboxWriter } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import { documentResponseOf } from "./document-response";
import { documentProcessJobName, documentResource, uploadDocumentAction, type ConfirmDocumentUploadRequest, type DocumentResponse } from "./models";
import type { DocumentRepository } from "./ports/document-repository";
import type { FileStore } from "./ports/file-store";
import { sniffContentType } from "./sniff-content-type";

export type ConfirmDocumentUploadDependencies = {
  readonly documentsScopedTo: (tenantId: TenantId) => DocumentRepository;
  readonly fileStore: FileStore;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: OutboxWriter;
  readonly jobsScopedTo: (tenantId: TenantId) => JobQueue;
};

export type ConfirmDocumentUpload = (
  request: ConfirmDocumentUploadRequest,
) => Promise<Result<DocumentResponse, DomainError>>;

const noUpload = notFound("document.upload.notFound", "No upload was found for this storage key");

export function confirmDocumentUpload(dependencies: ConfirmDocumentUploadDependencies): ConfirmDocumentUpload {
  const { documentsScopedTo, fileStore, permissions, clock, unitOfWork, outbox, jobsScopedTo } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: uploadDocumentAction,
      resource: documentResource,
    });
    if (isErr(authorization)) return authorization;

    const id = parseEntityId(request.storageKey);
    if (isErr(id)) return err(noUpload);

    const tenantId = request.actor.tenantId;
    const location = { tenantId, storageKey: id.value };
    const bytes = await fileStore.read(location);
    if (!bytes) return err(noUpload);

    const contentType = sniffContentType(bytes);
    if (!contentType) {
      await fileStore.remove(location);
      return err(
        invariantViolation(
          "document.contentType.unsupported",
          "The uploaded content does not match a supported file type",
        ),
      );
    }

    const created = Document.create({
      id: id.value,
      tenantId,
      uploadedBy: request.actor.subjectId,
      originalFilename: request.filename,
      storageKey: id.value,
      contentType,
      sizeBytes: bytes.length,
      createdAt: clock.now(),
    });
    if (isErr(created)) {
      await fileStore.remove(location);
      return created;
    }

    const document = created.value;
    const documents = documentsScopedTo(tenantId);
    const jobs = jobsScopedTo(tenantId);
    await unitOfWork.run({ kind: "tenant", tenantId }, async () => {
      await documents.save(document);
      await outbox.enqueue(document.pullEvents());
      await jobs.enqueue({ tenantId, name: documentProcessJobName, payload: { documentId: document.id } });
    });

    return ok(documentResponseOf(document));
  };
}
