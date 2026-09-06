import { z } from "zod";
import type { Contract } from "../../kernel/contract";
import { tenantOutput, tenantSlug, type TenantOutput } from "./tenant-output";

const createTenantInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: tenantSlug,
});

export type CreateTenantInput = z.infer<typeof createTenantInput>;

export type CreateTenantOutput = TenantOutput;

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
  output: tenantOutput,
  errorCodes: createTenantErrorCodes,
  metadata: {
    auth: "session",
    humanCheck: false,
    idempotent: true,
    rateLimit: "tenants-write",
  },
};
