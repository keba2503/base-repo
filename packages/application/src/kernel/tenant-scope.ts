import type { TenantId } from "@base/domain";

export type TenantScope =
  | { readonly kind: "registry" }
  | { readonly kind: "tenant"; readonly tenantId: TenantId };
