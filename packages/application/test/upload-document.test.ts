import { beforeEach, describe, expect, it } from "bun:test";
import { isErr, isOk, type DomainError, type Result } from "@base/domain";
import { uploadDocument, type DocumentResponse, type UploadDocument } from "../src/index";
import { actorFactory } from "./factories/actor";
import { StubClock, StubIdGenerator, StubJobQueue, StubOutbox, StubPermissions, StubUnitOfWork } from "./doubles/ports";
import { StubDocumentRepository, StubFileStore } from "./doubles/documents-ports";

const createdAt = new Date("2026-01-15T10:00:00.000Z");

const pdfBytes = new TextEncoder().encode("%PDF-1.7 fake pdf body");
const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

type Harness = {
  useCase: UploadDocument;
  documents: StubDocumentRepository;
  fileStore: StubFileStore;
  jobs: StubJobQueue;
  outbox: StubOutbox;
  unitOfWork: StubUnitOfWork;
  permissions: StubPermissions;
};

function harnessFactory(granted: readonly string[] = ["documents:upload"]): Harness {
  const documents = new StubDocumentRepository();
  const fileStore = new StubFileStore();
  const jobs = new StubJobQueue();
  const outbox = new StubOutbox();
  const unitOfWork = new StubUnitOfWork();
  const permissions = new StubPermissions(granted);
  const useCase = uploadDocument({
    documentsScopedTo: () => documents,
    fileStore,
    permissions,
    clock: new StubClock(createdAt),
    idGenerator: new StubIdGenerator(),
    unitOfWork,
    outbox,
    jobsScopedTo: () => jobs,
  });
  return { useCase, documents, fileStore, jobs, outbox, unitOfWork, permissions };
}

function expectOk(result: Result<DocumentResponse, DomainError>): DocumentResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

function expectErr(result: Result<DocumentResponse, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("uploading a document", () => {
  it("returns the created document as pending", async () => {
    const response = expectOk(
      await harness.useCase({ actor: actorFactory(), filename: "informe.pdf", base64Content: pdfBase64 }),
    );
    expect(response.status).toBe("pending");
    expect(response.contentType).toBe("application/pdf");
    expect(response.originalFilename).toBe("informe.pdf");
  });

  it("sniffs the content type instead of trusting the caller", async () => {
    const response = expectOk(
      await harness.useCase({ actor: actorFactory(), filename: "misnamed.txt", base64Content: pdfBase64 }),
    );
    expect(response.contentType).toBe("application/pdf");
  });

  it("stores the file bytes under a system chosen storage key", async () => {
    await harness.useCase({ actor: actorFactory(), filename: "informe.pdf", base64Content: pdfBase64 });
    expect(harness.fileStore.savedKeys).toHaveLength(1);
  });

  it("persists the document", async () => {
    await harness.useCase({ actor: actorFactory(), filename: "informe.pdf", base64Content: pdfBase64 });
    expect(harness.documents.saved).toHaveLength(1);
  });

  it("enqueues a processing job", async () => {
    await harness.useCase({ actor: actorFactory(), filename: "informe.pdf", base64Content: pdfBase64 });
    const [job] = await harness.jobs.claimDue(10, createdAt);
    expect(job?.name).toBe("documents.process");
  });

  it("enqueues the uploaded event", async () => {
    await harness.useCase({ actor: actorFactory(), filename: "informe.pdf", base64Content: pdfBase64 });
    expect(harness.outbox.events.map((event) => event.name)).toEqual(["document.uploaded"]);
  });

  it("persists inside a single unit of work", async () => {
    await harness.useCase({ actor: actorFactory(), filename: "informe.pdf", base64Content: pdfBase64 });
    expect(harness.unitOfWork.runs).toBe(1);
  });
});

describe("rejecting an upload", () => {
  it("refuses an actor without the upload permission", async () => {
    const denied = harnessFactory([]);
    const error = expectErr(
      await denied.useCase({ actor: actorFactory(), filename: "informe.pdf", base64Content: pdfBase64 }),
    );
    expect(error.kind).toBe("forbidden");
  });

  it("writes nothing when the actor is not allowed", async () => {
    const denied = harnessFactory([]);
    await denied.useCase({ actor: actorFactory(), filename: "informe.pdf", base64Content: pdfBase64 });
    expect(denied.documents.saved).toEqual([]);
  });

  it("refuses content that is not valid base64", async () => {
    const error = expectErr(
      await harness.useCase({ actor: actorFactory(), filename: "informe.pdf", base64Content: "%%not-base64%%" }),
    );
    expect(error.code).toBe("document.content.malformed");
  });

  it("refuses content whose bytes do not match a supported file type", async () => {
    const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const base64 = Buffer.from(unknownBytes).toString("base64");
    const error = expectErr(await harness.useCase({ actor: actorFactory(), filename: "raw.bin", base64Content: base64 }));
    expect(error.code).toBe("document.contentType.unsupported");
  });

  it("writes nothing when the content type is unsupported", async () => {
    const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const base64 = Buffer.from(unknownBytes).toString("base64");
    await harness.useCase({ actor: actorFactory(), filename: "raw.bin", base64Content: base64 });
    expect(harness.documents.saved).toEqual([]);
    expect(harness.fileStore.savedKeys).toEqual([]);
  });

  it("refuses a filename that breaks the domain invariant", async () => {
    const error = expectErr(await harness.useCase({ actor: actorFactory(), filename: " ", base64Content: pdfBase64 }));
    expect(error.code).toBe("document.filename.length");
  });
});
