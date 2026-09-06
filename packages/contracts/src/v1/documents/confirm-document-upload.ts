import { z } from "zod";
import type { Contract } from "../../kernel/contract";
import { documentOutput, type DocumentOutput } from "./document-output";

export const documentFilenameMinimumLength = 1;
export const documentFilenameMaximumLength = 255;

const confirmDocumentUploadInput = z.object({
  storageKey: z.uuid(),
  filename: z.string().trim().min(documentFilenameMinimumLength).max(documentFilenameMaximumLength),
});

export type ConfirmDocumentUploadInput = z.infer<typeof confirmDocumentUploadInput>;

export type ConfirmDocumentUploadOutput = DocumentOutput;

export const confirmDocumentUploadErrorCodes = [
  "document.upload.notFound",
  "document.filename.length",
  "document.contentType.unsupported",
  "document.size.invalid",
  "document.size.tooLarge",
  "authorization.denied",
] as const;

export const confirmDocumentUploadContract: Contract<ConfirmDocumentUploadInput, ConfirmDocumentUploadOutput> = {
  name: "documents.confirmUpload",
  input: confirmDocumentUploadInput,
  output: documentOutput,
  errorCodes: confirmDocumentUploadErrorCodes,
  metadata: {
    auth: "either",
    humanCheck: false,
    idempotent: true,
    rateLimit: "documents-write",
  },
};
