import { z } from "zod";
import type { Contract } from "../../kernel/contract";
import { documentOutput } from "./document-output";

export const listDocumentsDefaultLimit = 20;
export const listDocumentsMaximumLimit = 100;

const listDocumentsInput = z.object({
  limit: z.coerce.number().int().positive().max(listDocumentsMaximumLimit).default(listDocumentsDefaultLimit),
});

export type ListDocumentsInput = z.infer<typeof listDocumentsInput>;

const listDocumentsOutput = z.object({
  documents: z.array(documentOutput),
});

export type ListDocumentsOutput = z.infer<typeof listDocumentsOutput>;

export const listDocumentsErrorCodes = ["authorization.denied"] as const;

export const listDocumentsContract: Contract<ListDocumentsInput, ListDocumentsOutput> = {
  name: "documents.list",
  input: listDocumentsInput,
  output: listDocumentsOutput,
  errorCodes: listDocumentsErrorCodes,
  metadata: {
    auth: "either",
    humanCheck: false,
    idempotent: false,
    rateLimit: "documents-read",
  },
};
