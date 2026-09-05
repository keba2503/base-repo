import { isOk, parseTenantId, Tenant, type TenantId, type TenantSnapshot } from "@base/domain";

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

export function tenantFactory(overrides: Partial<TenantSnapshot> = {}): Tenant {
  const created = Tenant.create(tenantSnapshotFactory(overrides));
  if (!isOk(created)) throw new Error("The tenant factory produced an invalid tenant");
  return created.value;
}
