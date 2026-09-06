import type { DocumentResponse } from "@base/application";

export function documentResponseFactory(overrides: Partial<DocumentResponse> = {}): DocumentResponse {
  return {
    id: "00000000-0000-4000-8000-000000000030",
    tenantId: "00000000-0000-4000-8000-000000000384",
    originalFilename: "informe.pdf",
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
