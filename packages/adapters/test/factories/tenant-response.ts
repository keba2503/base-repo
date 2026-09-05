import type { TenantResponse } from "@base/application";

export function tenantResponseFactory(overrides: Partial<TenantResponse> = {}): TenantResponse {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Acme Clinic",
    slug: "acme-clinic",
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  };
}
