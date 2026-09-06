import { resourceOfAction } from "@base/domain";
import type { Actor } from "../kernel/actor";

export type CreateDocumentUploadRequest = {
  readonly actor: Actor;
};

export type CreateDocumentUploadResponse = {
  readonly storageKey: string;
  readonly uploadUrl: string;
  readonly expiresInSeconds: number;
};

export type ConfirmDocumentUploadRequest = {
  readonly actor: Actor;
  readonly storageKey: string;
  readonly filename: string;
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
export const documentUploadUrlExpiresInSeconds = 5 * 60;

export type ProcessDocumentJobPayload = {
  readonly documentId: string;
};
