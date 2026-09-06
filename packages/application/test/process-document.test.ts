import { beforeEach, describe, expect, it } from "bun:test";
import { err, isErr, isOk, unavailable } from "@base/domain";
import { processDocument, type JobExecutor } from "../src/index";
import { tenantIdFactory } from "./factories/actor";
import { documentFactory } from "./factories/document";
import { storedJobFactory } from "./factories/job";
import { StubClock, StubUnitOfWork } from "./doubles/ports";
import { StubDocumentProcessor, StubDocumentRepository, StubFileStore } from "./doubles/documents-ports";

const now = new Date("2026-01-16T10:00:00.000Z");
const bytes = new TextEncoder().encode("%PDF-1.7 fake pdf body");

type Harness = {
  executor: JobExecutor;
  documents: StubDocumentRepository;
  fileStore: StubFileStore;
  processor: StubDocumentProcessor;
  unitOfWork: StubUnitOfWork;
};

function harnessFactory(): Harness {
  const documents = new StubDocumentRepository();
  const fileStore = new StubFileStore();
  const processor = new StubDocumentProcessor();
  const unitOfWork = new StubUnitOfWork();
  const executor = processDocument({
    documentsScopedTo: (tenantId) => documents.scopedTo(tenantId),
    fileStore,
    processor,
    clock: new StubClock(now),
    unitOfWork,
  });
  return { executor, documents, fileStore, processor, unitOfWork };
}

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("processing a document", () => {
  it("carries the job name the queue dispatches by", () => {
    expect(harness.executor.jobName).toBe("documents.process");
  });

  it("marks the document as processed with the extracted text", async () => {
    const document = documentFactory();
    harness.documents.seed(document);
    await harness.fileStore.save({ tenantId: document.tenantId, storageKey: document.storageKey, contentType: document.contentType, bytes });
    harness.processor.resolveWith({ kind: "ok", value: { extractedText: "hola" } });

    const result = await harness.executor.execute(storedJobFactory({ tenantId: document.tenantId, payload: { documentId: document.id } }));

    expect(isOk(result)).toBe(true);
    const saved = harness.documents.saved.find((candidate) => candidate.id === document.id);
    expect([saved?.status, saved?.extractedText]).toEqual(["processed", "hola"]);
  });

  it("passes the stored bytes and content type to the processor", async () => {
    const document = documentFactory();
    harness.documents.seed(document);
    await harness.fileStore.save({ tenantId: document.tenantId, storageKey: document.storageKey, contentType: document.contentType, bytes });

    await harness.executor.execute(storedJobFactory({ tenantId: document.tenantId, payload: { documentId: document.id } }));

    expect(harness.processor.requests).toEqual([{ contentType: document.contentType, bytes }]);
  });

  it("marks the document as failed when the processor fails", async () => {
    const document = documentFactory();
    harness.documents.seed(document);
    await harness.fileStore.save({ tenantId: document.tenantId, storageKey: document.storageKey, contentType: document.contentType, bytes });
    harness.processor.resolveWith(err(unavailable("ocr.timeout", "The processor timed out")));

    const result = await harness.executor.execute(storedJobFactory({ tenantId: document.tenantId, payload: { documentId: document.id } }));

    expect(isErr(result)).toBe(true);
    const saved = harness.documents.saved.find((candidate) => candidate.id === document.id);
    expect([saved?.status, saved?.failureReason]).toEqual(["failed", "The processor timed out"]);
  });

  it("fails the document when its stored file cannot be read", async () => {
    const document = documentFactory();
    harness.documents.seed(document);

    const result = await harness.executor.execute(storedJobFactory({ tenantId: document.tenantId, payload: { documentId: document.id } }));

    expect(isErr(result)).toBe(true);
    const saved = harness.documents.saved.find((candidate) => candidate.id === document.id);
    expect(saved?.status).toBe("failed");
  });

  it("refuses a job whose payload carries no documentId", async () => {
    const result = await harness.executor.execute(storedJobFactory({ payload: {} }));
    expect(isErr(result)).toBe(true);
  });

  it("refuses a job for a document that no longer exists", async () => {
    const result = await harness.executor.execute(
      storedJobFactory({ tenantId: tenantIdFactory(1), payload: { documentId: documentFactory().id } }),
    );
    expect(isErr(result)).toBe(true);
  });

  it("allows retrying a document that previously failed", async () => {
    const document = documentFactory({ status: "failed", failureReason: "ocr.timeout" });
    harness.documents.seed(document);
    await harness.fileStore.save({ tenantId: document.tenantId, storageKey: document.storageKey, contentType: document.contentType, bytes });
    harness.processor.resolveWith({ kind: "ok", value: { extractedText: "hola" } });

    const result = await harness.executor.execute(storedJobFactory({ tenantId: document.tenantId, payload: { documentId: document.id } }));

    expect(isOk(result)).toBe(true);
    const saved = harness.documents.saved.find((candidate) => candidate.id === document.id);
    expect(saved?.status).toBe("processed");
  });
});
