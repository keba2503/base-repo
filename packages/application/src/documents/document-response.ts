import type { Document } from "@base/domain";
import type { DocumentResponse } from "./models";

export function documentResponseOf(document: Document): DocumentResponse {
  return {
    id: document.id,
    tenantId: document.tenantId,
    originalFilename: document.originalFilename,
    contentType: document.contentType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    extractedText: document.extractedText,
    failureReason: document.failureReason,
    createdAt: document.createdAt,
    processedAt: document.processedAt,
  };
}
