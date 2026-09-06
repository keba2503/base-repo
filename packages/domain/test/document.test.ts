import { describe, expect, it } from "bun:test";
import { isOk } from "../src/kernel/result";
import { Document, documentFieldClassifications, type DocumentSnapshot } from "../src/documents/document";
import { documentSnapshotFactory } from "./factories/document";

const createdAt = new Date("2026-01-15T10:00:00.000Z");
const later = new Date("2026-01-16T10:00:00.000Z");

function createFailureCode(snapshot: Omit<DocumentSnapshot, "status" | "extractedText" | "failureReason" | "processedAt">): string {
  const result = Document.create(snapshot);
  if (isOk(result)) throw new Error("Expected the document to be rejected");
  return result.error.code;
}

function uploadedDocument(overrides: Partial<DocumentSnapshot> = {}): Document {
  const snapshot = documentSnapshotFactory(overrides);
  const result = Document.create(snapshot);
  if (!isOk(result)) throw new Error(`Expected the document to be accepted, received ${result.error.code}`);
  return result.value;
}

describe("document upload", () => {
  it("starts pending", () => {
    expect(uploadedDocument().status).toBe("pending");
  });

  it("records an uploaded event", () => {
    const document = uploadedDocument();
    expect(document.pullEvents()).toEqual([
      {
        name: "document.uploaded",
        tenantId: document.tenantId,
        occurredAt: createdAt,
        payload: { documentId: document.id, storageKey: document.storageKey, contentType: document.contentType },
      },
    ]);
  });

  it("trims the original filename", () => {
    expect(uploadedDocument({ originalFilename: "  informe.pdf  " }).originalFilename).toBe("informe.pdf");
  });

  it("rejects an empty filename", () => {
    expect(createFailureCode(documentSnapshotFactory({ originalFilename: " " }))).toBe("document.filename.length");
  });

  it("rejects an empty storage key", () => {
    expect(createFailureCode(documentSnapshotFactory({ storageKey: "" }))).toBe("document.storageKey.empty");
  });

  it("rejects an unsupported content type", () => {
    expect(createFailureCode(documentSnapshotFactory({ contentType: "application/x-msdownload" }))).toBe(
      "document.contentType.unsupported",
    );
  });

  it("rejects a zero size", () => {
    expect(createFailureCode(documentSnapshotFactory({ sizeBytes: 0 }))).toBe("document.size.invalid");
  });

  it("rejects a size over the maximum", () => {
    expect(createFailureCode(documentSnapshotFactory({ sizeBytes: 21 * 1024 * 1024 }))).toBe("document.size.tooLarge");
  });
});

describe("document processing state machine", () => {
  it("moves from pending to processing", () => {
    const document = uploadedDocument();
    const result = document.startProcessing(later);
    expect([isOk(result), document.status]).toEqual([true, "processing"]);
  });

  it("records a processing started event", () => {
    const document = uploadedDocument();
    document.pullEvents();
    document.startProcessing(later);
    expect(document.pullEvents()).toEqual([
      { name: "document.processing.started", tenantId: document.tenantId, occurredAt: later, payload: { documentId: document.id } },
    ]);
  });

  it("refuses to start processing an already processing document", () => {
    const document = uploadedDocument();
    document.startProcessing(later);
    const result = document.startProcessing(later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("document.status.notPendingOrFailed");
  });

  it("moves from processing to processed", () => {
    const document = uploadedDocument();
    document.startProcessing(later);
    const result = document.complete({ at: later, extractedText: "hola" });
    expect([isOk(result), document.status, document.extractedText]).toEqual([true, "processed", "hola"]);
  });

  it("accepts a null extracted text", () => {
    const document = uploadedDocument();
    document.startProcessing(later);
    document.complete({ at: later, extractedText: null });
    expect(document.extractedText).toBeNull();
  });

  it("records a processed event", () => {
    const document = uploadedDocument();
    document.startProcessing(later);
    document.pullEvents();
    document.complete({ at: later, extractedText: "hola" });
    expect(document.pullEvents()).toEqual([
      {
        name: "document.processed",
        tenantId: document.tenantId,
        occurredAt: later,
        payload: { documentId: document.id, hasExtractedText: true },
      },
    ]);
  });

  it("refuses to complete a document that never started processing", () => {
    const document = uploadedDocument();
    const result = document.complete({ at: later, extractedText: "hola" });
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("document.status.notProcessing");
  });

  it("refuses to complete an already processed document", () => {
    const document = uploadedDocument();
    document.startProcessing(later);
    document.complete({ at: later, extractedText: "hola" });
    const result = document.complete({ at: later, extractedText: "hola" });
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("document.status.notProcessing");
  });

  it("moves from processing to failed", () => {
    const document = uploadedDocument();
    document.startProcessing(later);
    const result = document.fail({ at: later, reason: "ocr.timeout" });
    expect([isOk(result), document.status, document.failureReason]).toEqual([true, "failed", "ocr.timeout"]);
  });

  it("records a processing failed event", () => {
    const document = uploadedDocument();
    document.startProcessing(later);
    document.pullEvents();
    document.fail({ at: later, reason: "ocr.timeout" });
    expect(document.pullEvents()).toEqual([
      {
        name: "document.processing.failed",
        tenantId: document.tenantId,
        occurredAt: later,
        payload: { documentId: document.id, reason: "ocr.timeout" },
      },
    ]);
  });

  it("refuses to fail a document that never started processing", () => {
    const document = uploadedDocument();
    const result = document.fail({ at: later, reason: "ocr.timeout" });
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("document.status.notProcessing");
  });

  it("refuses to fail an already processed document", () => {
    const document = uploadedDocument();
    document.startProcessing(later);
    document.complete({ at: later, extractedText: "hola" });
    const result = document.fail({ at: later, reason: "ocr.timeout" });
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("document.status.notProcessing");
  });

  it("allows a failed document to be retried", () => {
    const document = uploadedDocument();
    document.startProcessing(later);
    document.fail({ at: later, reason: "ocr.timeout" });
    const result = document.startProcessing(later);
    expect([isOk(result), document.status, document.failureReason]).toEqual([true, "processing", null]);
  });
});

describe("document restoration", () => {
  it("does not record an event", () => {
    const result = Document.restore(documentSnapshotFactory());
    if (!isOk(result)) throw new Error("Expected the document to be accepted");
    expect(result.value.pullEvents()).toEqual([]);
  });

  it("restores a processed document as processed", () => {
    const result = Document.restore(
      documentSnapshotFactory({ status: "processed", extractedText: "hola", processedAt: later }),
    );
    if (!isOk(result)) throw new Error("Expected the document to be accepted");
    expect([result.value.status, result.value.extractedText]).toEqual(["processed", "hola"]);
  });
});

describe("document data classification", () => {
  it("declares the extracted text as sensitive so it never reaches a log line", () => {
    expect(documentFieldClassifications.extractedText).toBe("sensitive");
  });

  it("declares the original filename as personal", () => {
    expect(documentFieldClassifications.originalFilename).toBe("personal");
  });
});
