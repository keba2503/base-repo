import type { Tenant, TenantId } from "@base/domain";

export type TenantRepository = {
  findBySlug(slug: string): Promise<Tenant | undefined>;
  findById(id: TenantId): Promise<Tenant | undefined>;
  save(tenant: Tenant): Promise<void>;
};
