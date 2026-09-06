import { z } from "zod";
import type { Contract } from "../../kernel/contract";
import { documentOutput, type DocumentOutput } from "./document-output";

const getDocumentInput = z.object({
  documentId: z.uuid(),
});

export type GetDocumentInput = z.infer<typeof getDocumentInput>;

export type GetDocumentOutput = DocumentOutput;

export const getDocumentErrorCodes = ["document.notFound", "authorization.denied"] as const;

export const getDocumentContract: Contract<GetDocumentInput, GetDocumentOutput> = {
  name: "documents.get",
  input: getDocumentInput,
  output: documentOutput,
  errorCodes: getDocumentErrorCodes,
  metadata: {
    auth: "either",
    humanCheck: false,
    idempotent: false,
    rateLimit: "documents-read",
  },
};
