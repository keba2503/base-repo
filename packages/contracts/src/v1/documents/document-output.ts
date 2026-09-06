import { z } from "zod";

export const documentStatus = z.enum(["pending", "processing", "processed", "failed"]);

export const documentOutput = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  originalFilename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  status: documentStatus,
  extractedText: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  processedAt: z.iso.datetime().nullable(),
});

export type DocumentOutput = z.infer<typeof documentOutput>;
