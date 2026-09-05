import type { Tenant, TenantId } from "@base/domain";

export type TenantScope =
  | { readonly kind: "registry" }
  | { readonly kind: "tenant"; readonly tenantId: TenantId };

export type TenantRepository = {
  findBySlug(slug: string): Promise<Tenant | undefined>;
  findById(id: TenantId): Promise<Tenant | undefined>;
  save(tenant: Tenant): Promise<void>;
};
