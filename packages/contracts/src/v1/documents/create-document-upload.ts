import { z } from "zod";
import type { Contract } from "../../kernel/contract";

const createDocumentUploadInput = z.object({});

export type CreateDocumentUploadInput = z.infer<typeof createDocumentUploadInput>;

const createDocumentUploadOutput = z.object({
  storageKey: z.uuid(),
  uploadUrl: z.url(),
  expiresInSeconds: z.number(),
});

export type CreateDocumentUploadOutput = z.infer<typeof createDocumentUploadOutput>;

export const createDocumentUploadErrorCodes = ["authorization.denied"] as const;

export const createDocumentUploadContract: Contract<CreateDocumentUploadInput, CreateDocumentUploadOutput> = {
  name: "documents.createUpload",
  input: createDocumentUploadInput,
  output: createDocumentUploadOutput,
  errorCodes: createDocumentUploadErrorCodes,
  metadata: {
    auth: "either",
    humanCheck: false,
    idempotent: false,
    rateLimit: "documents-write",
  },
};
