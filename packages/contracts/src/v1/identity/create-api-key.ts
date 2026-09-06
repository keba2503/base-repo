import { permissionActions } from "@base/domain";
import { z } from "zod";
import type { Contract } from "../../kernel/contract";

const createApiKeyInput = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(permissionActions)).min(1),
});

const createApiKeyOutput = z.object({
  id: z.uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.enum(permissionActions)),
  createdAt: z.iso.datetime(),
  plaintextKey: z.string(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeyInput>;

export type CreateApiKeyOutput = z.infer<typeof createApiKeyOutput>;

export const createApiKeyErrorCodes = [
  "apiKey.name.length",
  "apiKey.scopes.empty",
  "apiKey.scopes.duplicate",
  "apiKey.scopes.unknown",
  "apiKey.scopes.escalation",
  "authorization.denied",
] as const;

export const createApiKeyContract: Contract<CreateApiKeyInput, CreateApiKeyOutput> = {
  name: "identity.apiKeys.create",
  input: createApiKeyInput,
  output: createApiKeyOutput,
  errorCodes: createApiKeyErrorCodes,
  metadata: {
    auth: "session",
    humanCheck: false,
    idempotent: true,
    rateLimit: "apikeys-write",
  },
};
