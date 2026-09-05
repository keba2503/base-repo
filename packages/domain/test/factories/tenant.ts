import { parseTenantId, type TenantId } from "../../src/kernel/identifiers";
import { isOk } from "../../src/kernel/result";
import type { TenantSnapshot } from "../../src/tenants/tenant";

export function tenantIdFactory(sequence: number): TenantId {
  const suffix = sequence.toString(16).padStart(12, "0");
  const parsed = parseTenantId(`00000000-0000-4000-8000-${suffix}`);
  if (!isOk(parsed)) throw new Error("The tenant id factory produced an invalid identifier");
  return parsed.value;
}

export function tenantSnapshotFactory(overrides: Partial<TenantSnapshot> = {}): TenantSnapshot {
  return {
    id: tenantIdFactory(1),
    name: "Acme Clinic",
    slug: "acme-clinic",
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  };
}
