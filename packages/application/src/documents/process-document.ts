import {
  err,
  invariantViolation,
  isErr,
  ok,
  parseEntityId,
  unavailable,
  type DomainError,
  type Result,
  type TenantId,
} from "@base/domain";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import type { StoredJob } from "../kernel/ports/job-queue";
import type { JobExecutor } from "../jobs/job-executor";
import { documentProcessJobName, type ProcessDocumentJobPayload } from "./models";
import type { Clock } from "../kernel/ports/clock";
import type { DocumentRepository } from "./ports/document-repository";
import type { DocumentProcessor } from "./ports/document-processor";
import type { FileStore } from "./ports/file-store";

export type ProcessDocumentDependencies = {
  readonly documentsScopedTo: (tenantId: TenantId) => DocumentRepository;
  readonly fileStore: FileStore;
  readonly processor: DocumentProcessor;
  readonly clock: Clock;
  readonly unitOfWork: UnitOfWork;
};

function isProcessDocumentPayload(payload: unknown): payload is ProcessDocumentJobPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Partial<ProcessDocumentJobPayload>).documentId === "string"
  );
}

export function processDocument(dependencies: ProcessDocumentDependencies): JobExecutor {
  const { documentsScopedTo, fileStore, processor, clock, unitOfWork } = dependencies;

  async function execute(job: StoredJob): Promise<Result<void, DomainError>> {
    if (!isProcessDocumentPayload(job.payload)) {
      return err(invariantViolation("documents.process.payload.malformed", "A document processing job must carry a documentId"));
    }

    const documentId = parseEntityId(job.payload.documentId);
    if (isErr(documentId)) {
      return err(invariantViolation("documents.process.payload.malformed", "A document processing job must carry a valid documentId"));
    }

    const documents = documentsScopedTo(job.tenantId);
    const document = await documents.findById(documentId.value);
    if (!document) {
      return err(unavailable("documents.process.notFound", "The document to process no longer exists"));
    }

    const started = document.startProcessing(clock.now());
    if (isErr(started)) return started;
    await unitOfWork.run({ kind: "tenant", tenantId: job.tenantId }, async () => {
      await documents.save(document);
    });

    const bytes = await fileStore.read({ tenantId: job.tenantId, storageKey: document.storageKey });
    if (!bytes) {
      const failed = document.fail({ at: clock.now(), reason: "documents.process.fileMissing" });
      if (isErr(failed)) return failed;
      await unitOfWork.run({ kind: "tenant", tenantId: job.tenantId }, async () => {
        await documents.save(document);
      });
      return err(unavailable("documents.process.fileMissing", "The stored file for this document could not be read"));
    }

    const processed = await processor.process({ contentType: document.contentType, bytes });
    if (isErr(processed)) {
      const failed = document.fail({ at: clock.now(), reason: processed.error.message });
      if (isErr(failed)) return failed;
      await unitOfWork.run({ kind: "tenant", tenantId: job.tenantId }, async () => {
        await documents.save(document);
      });
      return processed;
    }

    const completed = document.complete({ at: clock.now(), extractedText: processed.value.extractedText });
    if (isErr(completed)) return completed;
    await unitOfWork.run({ kind: "tenant", tenantId: job.tenantId }, async () => {
      await documents.save(document);
    });

    return ok(undefined);
  }

  return { jobName: documentProcessJobName, execute };
}
