import { Document, isOk, type DocumentSnapshot } from "@base/domain";
import { entityIdFactory } from "./identity";
import { tenantIdFactory } from "./actor";

export function documentSnapshotFactory(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    id: entityIdFactory(30),
    tenantId: tenantIdFactory(1),
    uploadedBy: entityIdFactory(10),
    originalFilename: "informe.pdf",
    storageKey: "30",
    contentType: "application/pdf",
    sizeBytes: 1_024,
    status: "pending",
    extractedText: null,
    failureReason: null,
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    processedAt: null,
    ...overrides,
  };
}

export function documentFactory(overrides: Partial<DocumentSnapshot> = {}): Document {
  const restored = Document.restore(documentSnapshotFactory(overrides));
  if (!isOk(restored)) throw new Error(`The document factory produced an invalid document, received ${restored.error.code}`);
  return restored.value;
}
