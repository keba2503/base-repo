import { describe, expect, it } from "bun:test";
import { isErr, isOk, Tenant } from "@base/domain";
import { getTenantBySlug, type GetTenantBySlug } from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import { StubPermissions, StubTenantRepository, StubTenantStore } from "./doubles/ports";

const createdAt = new Date("2026-01-15T10:00:00.000Z");

function seededStore(): StubTenantStore {
  const store = new StubTenantStore();
  const registry = new StubTenantRepository(store);
  const ownTenant = Tenant.create({ id: tenantIdFactory(900), name: "Acme Clinic", slug: "acme-clinic", createdAt });
  if (!isOk(ownTenant)) throw new Error("Expected a valid tenant");
  registry.seed(ownTenant.value);
  const otherTenant = Tenant.create({ id: tenantIdFactory(901), name: "Rival Clinic", slug: "rival-clinic", createdAt });
  if (!isOk(otherTenant)) throw new Error("Expected a valid tenant");
  registry.seed(otherTenant.value);
  return store;
}

function useCaseFactory(granted: readonly string[] = ["tenants:read"]): GetTenantBySlug {
  const store = seededStore();
  return getTenantBySlug({
    tenantsScopedTo: (tenantId) => new StubTenantRepository(store, { kind: "tenant", tenantId }),
    permissions: new StubPermissions(granted),
  });
}

describe("reading a tenant by slug", () => {
  it("returns the actor's own tenant", async () => {
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

  it("never leaks another tenant's row even when the actor guesses its slug", async () => {
    const result = await useCaseFactory()({ actor: actorFactory(), slug: "rival-clinic" });
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.kind).toBe("notFound");
  });
});
