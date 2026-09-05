import { describe, expect, it } from "bun:test";
import { isErr, isOk, Tenant } from "@base/domain";
import { getTenantBySlug, type GetTenantBySlug } from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import { StubPermissions, StubTenantRepository } from "./doubles/ports";

const createdAt = new Date("2026-01-15T10:00:00.000Z");

function seededRepository(): StubTenantRepository {
  const tenants = new StubTenantRepository();
  const tenant = Tenant.create({ id: tenantIdFactory(1), name: "Acme Clinic", slug: "acme-clinic", createdAt });
  if (!isOk(tenant)) throw new Error("Expected a valid tenant");
  tenants.seed(tenant.value);
  return tenants;
}

function useCaseFactory(granted: readonly string[] = ["tenants:read"]): GetTenantBySlug {
  return getTenantBySlug({ tenants: seededRepository(), permissions: new StubPermissions(granted) });
}

describe("reading a tenant by slug", () => {
  it("returns the tenant", async () => {
    const result = await useCaseFactory()({ actor: actorFactory(), slug: "acme-clinic" });
    if (!isOk(result)) throw new Error("Expected a success");
    expect(result.value.name).toBe("Acme Clinic");
  });

  it("reports an unknown slug as not found", async () => {
    const result = await useCaseFactory()({ actor: actorFactory(), slug: "unknown" });
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.kind).toBe("notFound");
  });

  it("refuses an actor without the read permission", async () => {
    const result = await useCaseFactory([])({ actor: actorFactory(), slug: "acme-clinic" });
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.kind).toBe("forbidden");
  });
});
