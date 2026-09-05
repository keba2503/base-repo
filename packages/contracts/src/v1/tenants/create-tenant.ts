import { z } from "zod";
import type { Contract } from "../../kernel/contract";

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const createTenantInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().min(3).max(40).regex(slugPattern),
});

const createTenantOutput = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.iso.datetime(),
});

export type CreateTenantInput = z.infer<typeof createTenantInput>;

export type CreateTenantOutput = z.infer<typeof createTenantOutput>;

export const createTenantErrorCodes = [
  "tenant.slug.taken",
  "tenant.name.length",
  "tenant.slug.length",
  "tenant.slug.format",
  "authorization.denied",
] as const;

export const createTenantContract: Contract<CreateTenantInput, CreateTenantOutput> = {
  name: "tenants.create",
  input: createTenantInput,
  output: createTenantOutput,
  errorCodes: createTenantErrorCodes,
  metadata: {
    auth: "session",
    humanCheck: false,
    idempotent: true,
    rateLimit: "tenants-write",
  },
};
