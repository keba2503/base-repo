import { z } from "zod";

export const tenantSlugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const tenantSlug = z.string().min(3).max(40).regex(tenantSlugPattern);

export const tenantOutput = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.iso.datetime(),
});

export type TenantOutput = z.infer<typeof tenantOutput>;
