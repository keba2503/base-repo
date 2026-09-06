import { z } from "zod";
import type { Contract } from "../../kernel/contract";
import { tenantOutput, tenantSlug, type TenantOutput } from "./tenant-output";

const getTenantBySlugInput = z.object({
  slug: tenantSlug,
});

export type GetTenantBySlugInput = z.infer<typeof getTenantBySlugInput>;

export type GetTenantBySlugOutput = TenantOutput;

export const getTenantBySlugErrorCodes = ["tenant.notFound", "authorization.denied"] as const;

export const getTenantBySlugContract: Contract<GetTenantBySlugInput, GetTenantBySlugOutput> = {
  name: "tenants.getBySlug",
  input: getTenantBySlugInput,
  output: tenantOutput,
  errorCodes: getTenantBySlugErrorCodes,
  metadata: {
    auth: "either",
    humanCheck: false,
    idempotent: false,
    rateLimit: "tenants-read",
  },
};
