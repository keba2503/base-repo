import { z } from "zod";
import type { Contract } from "../../kernel/contract";
import { documentOutput, type DocumentOutput } from "./document-output";

export const documentFilenameMinimumLength = 1;
export const documentFilenameMaximumLength = 255;
export const documentMaxSizeBytes = 20 * 1024 * 1024;

const base64MaximumLength = Math.ceil(documentMaxSizeBytes / 3) * 4;

const uploadDocumentInput = z.object({
  filename: z.string().trim().min(documentFilenameMinimumLength).max(documentFilenameMaximumLength),
  content: z.base64().max(base64MaximumLength),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentInput>;

export type UploadDocumentOutput = DocumentOutput;

export const uploadDocumentErrorCodes = [
  "document.filename.length",
  "document.contentType.unsupported",
  "document.size.invalid",
  "document.size.tooLarge",
  "document.content.malformed",
  "authorization.denied",
] as const;

export const uploadDocumentContract: Contract<UploadDocumentInput, UploadDocumentOutput> = {
  name: "documents.upload",
  input: uploadDocumentInput,
  output: documentOutput,
  errorCodes: uploadDocumentErrorCodes,
  metadata: {
    auth: "either",
    humanCheck: false,
    idempotent: true,
    rateLimit: "documents-write",
  },
};
