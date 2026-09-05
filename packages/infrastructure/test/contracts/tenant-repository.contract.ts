import { describe, expect, it } from "bun:test";
import type { TenantRepository } from "@base/application";
import type { Tenant, TenantId } from "@base/domain";
import { tenantFactory, tenantIdFactory } from "../factories/tenant";

export type TenantRepositoryHarness = {
  readonly registry: TenantRepository;
  scopedTo(tenantId: TenantId): TenantRepository;
};

const first = tenantFactory({ id: tenantIdFactory(1), slug: "acme-clinic", name: "Acme Clinic" });
const second = tenantFactory({ id: tenantIdFactory(2), slug: "beta-clinic", name: "Beta Clinic" });

async function seed(harness: TenantRepositoryHarness): Promise<void> {
  await harness.registry.save(first);
  await harness.registry.save(second);
}

function slugOf(tenant: Tenant | undefined): string | undefined {
  return tenant?.slug;
}

export function describeTenantRepositoryContract(
  name: string,
  createHarness: () => TenantRepositoryHarness,
): void {
  describe(`${name} satisfies the TenantRepository contract`, () => {
    it("finds a saved tenant by slug", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(slugOf(await harness.registry.findBySlug("acme-clinic"))).toBe("acme-clinic");
    });

    it("finds a saved tenant by id", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(slugOf(await harness.registry.findById(tenantIdFactory(2)))).toBe("beta-clinic");
    });

    it("returns nothing for an unknown slug", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.registry.findBySlug("unknown")).toBeUndefined();
    });

    it("returns nothing for an unknown id", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.registry.findById(tenantIdFactory(99))).toBeUndefined();
    });

    it("replaces a tenant saved twice", async () => {
      const harness = createHarness();
      await seed(harness);
      await harness.registry.save(tenantFactory({ id: tenantIdFactory(1), slug: "acme-clinic", name: "Acme Group" }));
      const stored = await harness.registry.findById(tenantIdFactory(1));
      expect(stored?.name).toBe("Acme Group");
    });

    it("lets a tenant scoped repository read its own tenant", async () => {
      const harness = createHarness();
      await seed(harness);
      const scoped = harness.scopedTo(tenantIdFactory(1));
      expect(slugOf(await scoped.findById(tenantIdFactory(1)))).toBe("acme-clinic");
    });

    it("hides another tenant from a tenant scoped repository looking up by id", async () => {
      const harness = createHarness();
      await seed(harness);
      const scoped = harness.scopedTo(tenantIdFactory(1));
      expect(await scoped.findById(tenantIdFactory(2))).toBeUndefined();
    });

    it("hides another tenant from a tenant scoped repository looking up by slug", async () => {
      const harness = createHarness();
      await seed(harness);
      const scoped = harness.scopedTo(tenantIdFactory(1));
      expect(await scoped.findBySlug("beta-clinic")).toBeUndefined();
    });

    it("refuses a write outside the scope of a tenant scoped repository", async () => {
      const harness = createHarness();
      const scoped = harness.scopedTo(tenantIdFactory(1));
      const rejected = Promise.resolve().then(() => scoped.save(second));
      const caught = await rejected.then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(Error);
    });
  });
}
