export { createTenant, type CreateTenant, type CreateTenantDependencies } from "./create-tenant";
export { getTenantBySlug, type GetTenantBySlug, type GetTenantBySlugDependencies } from "./get-tenant-by-slug";
export {
  createTenantAction,
  readTenantAction,
  tenantResource,
  type CreateTenantRequest,
  type GetTenantBySlugRequest,
  type TenantResponse,
} from "./models";
export type { TenantRepository, TenantScope } from "./ports/tenant-repository";
