import type { Actor } from "@base/application";
import { entityIdOf, isOk, parseTenantId } from "@base/domain";

const platformTenantId = "00000000-0000-4000-8000-00000000f1a7";

export function currentActor(): Actor {
  const tenantId = parseTenantId(platformTenantId);
  if (!isOk(tenantId)) throw new Error("The platform tenant identifier is malformed");
  return {
    tenantId: tenantId.value,
    subjectId: entityIdOf(tenantId.value),
    kind: "system",
    scopes: ["tenants:create", "tenants:read"],
  };
}
