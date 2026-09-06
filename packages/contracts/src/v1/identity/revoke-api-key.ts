import { permissionActions } from "@base/domain";
import { z } from "zod";
import type { Contract } from "../../kernel/contract";

const revokeApiKeyInput = z.object({
  apiKeyId: z.uuid(),
});

const revokeApiKeyOutput = z.object({
  id: z.uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.enum(permissionActions)),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime(),
});

export type RevokeApiKeyInput = z.infer<typeof revokeApiKeyInput>;

export type RevokeApiKeyOutput = z.infer<typeof revokeApiKeyOutput>;

export const revokeApiKeyErrorCodes = [
  "apiKey.notFound",
  "apiKey.alreadyRevoked",
  "apiKey.revokedAt.beforeCreation",
  "authorization.denied",
] as const;

export const revokeApiKeyContract: Contract<RevokeApiKeyInput, RevokeApiKeyOutput> = {
  name: "identity.apiKeys.revoke",
  input: revokeApiKeyInput,
  output: revokeApiKeyOutput,
  errorCodes: revokeApiKeyErrorCodes,
  metadata: {
    auth: "session",
    humanCheck: false,
    idempotent: true,
    rateLimit: "apikeys-write",
  },
};
