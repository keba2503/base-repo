import type { Actor } from "@base/application";
import { entityIdOf, isOk, parseTenantId, type TenantId } from "@base/domain";

export function tenantIdFactory(sequence: number): TenantId {
  const parsed = parseTenantId(`00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`);
  if (!isOk(parsed)) throw new Error("The tenant id factory produced an invalid identifier");
  return parsed.value;
}

export function actorFactory(overrides: Partial<Actor> = {}): Actor {
  return {
    tenantId: tenantIdFactory(900),
    subjectId: entityIdOf(tenantIdFactory(901)),
    kind: "user",
    scopes: ["tenants:create", "tenants:read"],
    ...overrides,
  };
}
