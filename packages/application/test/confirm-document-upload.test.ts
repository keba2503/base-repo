import { beforeEach, describe, expect, it } from "bun:test";
import { isErr, isOk, type DomainError, type Result } from "@base/domain";
import { confirmDocumentUpload, type ConfirmDocumentUpload, type DocumentResponse } from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import { entityIdFactory } from "./factories/identity";
import { StubClock, StubJobQueue, StubOutbox, StubPermissions, StubUnitOfWork } from "./doubles/ports";
import { StubDocumentRepository, StubFileStore } from "./doubles/documents-ports";

const createdAt = new Date("2026-01-15T10:00:00.000Z");
const pdfBytes = new TextEncoder().encode("%PDF-1.7 fake pdf body");

type Harness = {
  useCase: ConfirmDocumentUpload;
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
  const useCase = confirmDocumentUpload({
    documentsScopedTo: () => documents,
    fileStore,
    permissions,
    clock: new StubClock(createdAt),
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
const storageKey = entityIdFactory(1);
const tenantId = tenantIdFactory(900);

beforeEach(async () => {
  harness = harnessFactory();
  await harness.fileStore.save({ tenantId, storageKey, contentType: "application/pdf", bytes: pdfBytes });
});

describe("confirming a document upload", () => {
  it("returns the created document as pending", async () => {
    const response = expectOk(
      await harness.useCase({ actor: actorFactory(), storageKey, filename: "informe.pdf" }),
    );
    expect(response.status).toBe("pending");
    expect(response.contentType).toBe("application/pdf");
  });

  it("sniffs the content type instead of trusting the caller", async () => {
    const response = expectOk(
      await harness.useCase({ actor: actorFactory(), storageKey, filename: "misnamed.txt" }),
    );
    expect(response.contentType).toBe("application/pdf");
  });

  it("persists the document", async () => {
    await harness.useCase({ actor: actorFactory(), storageKey, filename: "informe.pdf" });
    expect(harness.documents.saved).toHaveLength(1);
  });

  it("enqueues a processing job", async () => {
    await harness.useCase({ actor: actorFactory(), storageKey, filename: "informe.pdf" });
    const [job] = await harness.jobs.claimDue(10, createdAt);
    expect(job?.name).toBe("documents.process");
  });

  it("enqueues the uploaded event", async () => {
    await harness.useCase({ actor: actorFactory(), storageKey, filename: "informe.pdf" });
    expect(harness.outbox.events.map((event) => event.name)).toEqual(["document.uploaded"]);
  });

  it("persists inside a single unit of work", async () => {
    await harness.useCase({ actor: actorFactory(), storageKey, filename: "informe.pdf" });
    expect(harness.unitOfWork.runs).toBe(1);
  });
});

describe("rejecting a confirmation", () => {
  it("refuses an actor without the upload permission", async () => {
    const denied = harnessFactory([]);
    await denied.fileStore.save({ tenantId, storageKey, contentType: "application/pdf", bytes: pdfBytes });
    const error = expectErr(await denied.useCase({ actor: actorFactory(), storageKey, filename: "informe.pdf" }));
    expect(error.kind).toBe("forbidden");
  });

  it("refuses a storage key that was never uploaded", async () => {
    const error = expectErr(
      await harness.useCase({ actor: actorFactory(), storageKey: entityIdFactory(999), filename: "informe.pdf" }),
    );
    expect(error.code).toBe("document.upload.notFound");
  });

  it("refuses a storage key that is not a valid identifier", async () => {
    const error = expectErr(await harness.useCase({ actor: actorFactory(), storageKey: "not-an-id", filename: "informe.pdf" }));
    expect(error.code).toBe("document.upload.notFound");
  });

  it("refuses and removes content that does not match a supported file type", async () => {
    const unknownKey = entityIdFactory(2);
    await harness.fileStore.save({
      tenantId,
      storageKey: unknownKey,
      contentType: "application/octet-stream",
      bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
    });
    const error = expectErr(await harness.useCase({ actor: actorFactory(), storageKey: unknownKey, filename: "raw.bin" }));
    expect(error.code).toBe("document.contentType.unsupported");
    expect(await harness.fileStore.read({ tenantId, storageKey: unknownKey })).toBeUndefined();
  });

  it("writes nothing when the content type is unsupported", async () => {
    const unknownKey = entityIdFactory(2);
    await harness.fileStore.save({
      tenantId,
      storageKey: unknownKey,
      contentType: "application/octet-stream",
      bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
    });
    await harness.useCase({ actor: actorFactory(), storageKey: unknownKey, filename: "raw.bin" });
    expect(harness.documents.saved).toEqual([]);
  });

  it("refuses and removes content when the filename breaks the domain invariant", async () => {
    const error = expectErr(await harness.useCase({ actor: actorFactory(), storageKey, filename: " " }));
    expect(error.code).toBe("document.filename.length");
    expect(await harness.fileStore.read({ tenantId, storageKey })).toBeUndefined();
  });
});
