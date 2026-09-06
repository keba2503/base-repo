import { resourceOfAction } from "@base/domain";
import type { Actor } from "../kernel/actor";

export type UploadDocumentRequest = {
  readonly actor: Actor;
  readonly filename: string;
  readonly base64Content: string;
};

export type GetDocumentRequest = {
  readonly actor: Actor;
  readonly documentId: string;
};

export type ListDocumentsRequest = {
  readonly actor: Actor;
  readonly limit: number;
};

export type DocumentResponse = {
  readonly id: string;
  readonly tenantId: string;
  readonly originalFilename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly status: string;
  readonly extractedText: string | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly processedAt: Date | null;
};

export type ListDocumentsResponse = {
  readonly documents: readonly DocumentResponse[];
};

export const uploadDocumentAction = "documents:upload";
export const readDocumentsAction = "documents:read";
export const documentResource = resourceOfAction(uploadDocumentAction);

export const documentProcessJobName = "documents.process";

export type ProcessDocumentJobPayload = {
  readonly documentId: string;
};
