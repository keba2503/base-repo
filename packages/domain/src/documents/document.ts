import { AggregateRoot } from "../kernel/aggregate-root";
import { classify, type FieldClassifications } from "../kernel/classification";
import { conflict, invariantViolation, type DomainError } from "../kernel/domain-error";
import type { DomainEvent } from "../kernel/domain-event";
import type { EntityId, TenantId } from "../kernel/identifiers";
import { err, ok, type Result } from "../kernel/result";

export type DocumentStatus = "pending" | "processing" | "processed" | "failed";

export type DocumentSnapshot = {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly uploadedBy: EntityId;
  readonly originalFilename: string;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly status: DocumentStatus;
  readonly extractedText: string | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly processedAt: Date | null;
};

export type DocumentUploadedPayload = {
  readonly documentId: string;
  readonly storageKey: string;
  readonly contentType: string;
};

export type DocumentProcessingStartedPayload = {
  readonly documentId: string;
};

export type DocumentProcessedPayload = {
  readonly documentId: string;
  readonly hasExtractedText: boolean;
};

export type DocumentProcessingFailedPayload = {
  readonly documentId: string;
  readonly reason: string;
};

export type DocumentUploaded = DomainEvent<"document.uploaded", DocumentUploadedPayload>;
export type DocumentProcessingStarted = DomainEvent<"document.processing.started", DocumentProcessingStartedPayload>;
export type DocumentProcessed = DomainEvent<"document.processed", DocumentProcessedPayload>;
export type DocumentProcessingFailed = DomainEvent<"document.processing.failed", DocumentProcessingFailedPayload>;

export const documentFilenameMinimumLength = 1;
export const documentFilenameMaximumLength = 255;
export const documentMaxSizeBytes = 20 * 1024 * 1024;

export const acceptedDocumentContentTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
] as const;

export type AcceptedDocumentContentType = (typeof acceptedDocumentContentTypes)[number];

export function isAcceptedDocumentContentType(value: string): value is AcceptedDocumentContentType {
  return acceptedDocumentContentTypes.some((candidate) => candidate === value);
}

export const documentFieldClassifications: FieldClassifications<DocumentSnapshot> = classify<DocumentSnapshot>({
  id: "none",
  tenantId: "none",
  uploadedBy: "none",
  originalFilename: "personal",
  storageKey: "none",
  contentType: "none",
  sizeBytes: "none",
  status: "none",
  extractedText: "sensitive",
  failureReason: "none",
  createdAt: "none",
  processedAt: "none",
});

function validateFilename(filename: string): DomainError | undefined {
  if (filename.length < documentFilenameMinimumLength || filename.length > documentFilenameMaximumLength) {
    return invariantViolation(
      "document.filename.length",
      `A document filename must have between ${String(documentFilenameMinimumLength)} and ${String(documentFilenameMaximumLength)} characters`,
    );
  }
  return undefined;
}

function validateStorageKey(storageKey: string): DomainError | undefined {
  if (storageKey.length === 0) {
    return invariantViolation("document.storageKey.empty", "A document must carry a storage key assigned by the system");
  }
  return undefined;
}

function validateContentType(contentType: string): DomainError | undefined {
  if (!isAcceptedDocumentContentType(contentType)) {
    return invariantViolation(
      "document.contentType.unsupported",
      `A document content type must be one of ${acceptedDocumentContentTypes.join(", ")}`,
    );
  }
  return undefined;
}

function validateSize(sizeBytes: number): DomainError | undefined {
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return invariantViolation("document.size.invalid", "A document size must be a positive integer number of bytes");
  }
  if (sizeBytes > documentMaxSizeBytes) {
    return invariantViolation(
      "document.size.tooLarge",
      `A document must not exceed ${String(documentMaxSizeBytes)} bytes`,
    );
  }
  return undefined;
}

export class Document extends AggregateRoot {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly uploadedBy: EntityId;
  readonly originalFilename: string;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;
  #status: DocumentStatus;
  #extractedText: string | null;
  #failureReason: string | null;
  #processedAt: Date | null;

  private constructor(snapshot: DocumentSnapshot) {
    super();
    this.id = snapshot.id;
    this.tenantId = snapshot.tenantId;
    this.uploadedBy = snapshot.uploadedBy;
    this.originalFilename = snapshot.originalFilename;
    this.storageKey = snapshot.storageKey;
    this.contentType = snapshot.contentType;
    this.sizeBytes = snapshot.sizeBytes;
    this.createdAt = snapshot.createdAt;
    this.#status = snapshot.status;
    this.#extractedText = snapshot.extractedText;
    this.#failureReason = snapshot.failureReason;
    this.#processedAt = snapshot.processedAt;
  }

  get status(): DocumentStatus {
    return this.#status;
  }

  get extractedText(): string | null {
    return this.#extractedText;
  }

  get failureReason(): string | null {
    return this.#failureReason;
  }

  get processedAt(): Date | null {
    return this.#processedAt;
  }

  static create(
    snapshot: Omit<DocumentSnapshot, "status" | "extractedText" | "failureReason" | "processedAt">,
  ): Result<Document, DomainError> {
    const restored = Document.restore({
      ...snapshot,
      status: "pending",
      extractedText: null,
      failureReason: null,
      processedAt: null,
    });
    if (restored.kind === "err") return restored;
    const document = restored.value;
    document.record({
      name: "document.uploaded",
      tenantId: document.tenantId,
      occurredAt: document.createdAt,
      payload: { documentId: document.id, storageKey: document.storageKey, contentType: document.contentType },
    });
    return ok(document);
  }

  static restore(snapshot: DocumentSnapshot): Result<Document, DomainError> {
    const originalFilename = snapshot.originalFilename.trim();
    const invalid =
      validateFilename(originalFilename) ??
      validateStorageKey(snapshot.storageKey) ??
      validateContentType(snapshot.contentType) ??
      validateSize(snapshot.sizeBytes);
    if (invalid) return err(invalid);
    return ok(new Document({ ...snapshot, originalFilename }));
  }

  startProcessing(at: Date): Result<void, DomainError> {
    if (this.#status !== "pending" && this.#status !== "failed") {
      return err(
        conflict("document.status.notPendingOrFailed", `A document in status ${this.#status} cannot start processing`),
      );
    }
    this.#status = "processing";
    this.#failureReason = null;
    this.record({
      name: "document.processing.started",
      tenantId: this.tenantId,
      occurredAt: at,
      payload: { documentId: this.id },
    });
    return ok(undefined);
  }

  complete(input: { readonly at: Date; readonly extractedText: string | null }): Result<void, DomainError> {
    if (this.#status !== "processing") {
      return err(conflict("document.status.notProcessing", `A document in status ${this.#status} cannot be completed`));
    }
    this.#status = "processed";
    this.#extractedText = input.extractedText;
    this.#failureReason = null;
    this.#processedAt = input.at;
    this.record({
      name: "document.processed",
      tenantId: this.tenantId,
      occurredAt: input.at,
      payload: { documentId: this.id, hasExtractedText: input.extractedText !== null },
    });
    return ok(undefined);
  }

  fail(input: { readonly at: Date; readonly reason: string }): Result<void, DomainError> {
    if (this.#status !== "processing") {
      return err(conflict("document.status.notProcessing", `A document in status ${this.#status} cannot be marked as failed`));
    }
    this.#status = "failed";
    this.#failureReason = input.reason;
    this.#processedAt = input.at;
    this.record({
      name: "document.processing.failed",
      tenantId: this.tenantId,
      occurredAt: input.at,
      payload: { documentId: this.id, reason: input.reason },
    });
    return ok(undefined);
  }

  toSnapshot(): DocumentSnapshot {
    return {
      id: this.id,
      tenantId: this.tenantId,
      uploadedBy: this.uploadedBy,
      originalFilename: this.originalFilename,
      storageKey: this.storageKey,
      contentType: this.contentType,
      sizeBytes: this.sizeBytes,
      status: this.#status,
      extractedText: this.#extractedText,
      failureReason: this.#failureReason,
      createdAt: this.createdAt,
      processedAt: this.#processedAt,
    };
  }
}
