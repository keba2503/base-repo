import { describe, expect, it } from "bun:test";
import type { ApiKeyRepository } from "@base/application";
import type { TenantId } from "@base/domain";
import { apiKeyFactory, entityIdFactory } from "../factories/identity";
import { tenantIdFactory } from "../factories/tenant";

export type ApiKeyRepositoryHarness = {
  readonly registry: ApiKeyRepository;
  scopedTo(tenantId: TenantId): ApiKeyRepository;
};

const first = apiKeyFactory({ id: entityIdFactory(1), tenantId: tenantIdFactory(1), name: "First" });
const second = apiKeyFactory({ id: entityIdFactory(2), tenantId: tenantIdFactory(2), name: "Second" });

async function seed(harness: ApiKeyRepositoryHarness): Promise<void> {
  await harness.registry.save(first);
  await harness.registry.save(second);
}

export function describeApiKeyRepositoryContract(
  name: string,
  createHarness: () => ApiKeyRepositoryHarness,
): void {
  describe(`${name} satisfies the ApiKeyRepository contract`, () => {
    it("finds a saved key by prefix at registry level", async () => {
      const harness = createHarness();
      await seed(harness);
      expect((await harness.registry.findByPrefix(second.keyPrefix))?.name).toBe("Second");
    });

    it("finds a saved key by id", async () => {
      const harness = createHarness();
      await seed(harness);
      expect((await harness.registry.findById(entityIdFactory(1)))?.name).toBe("First");
    });

    it("returns nothing for an unknown prefix", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.registry.findByPrefix("ak_ffffffffffffffffffffffffffffffff")).toBeUndefined();
    });

    it("returns nothing for an unknown id", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.registry.findById(entityIdFactory(99))).toBeUndefined();
    });

    it("keeps the hash it was given", async () => {
      const harness = createHarness();
      await seed(harness);
      expect((await harness.registry.findById(entityIdFactory(1)))?.keyHash).toBe("hashed-secret");
    });

    it("persists a revocation", async () => {
      const harness = createHarness();
      await seed(harness);
      const stored = await harness.registry.findById(entityIdFactory(1));
      if (!stored) throw new Error("Expected the key to be stored");
      stored.revoke(new Date("2026-02-01T00:00:00.000Z"));
      await harness.registry.save(stored);
      expect((await harness.registry.findById(entityIdFactory(1)))?.isRevoked).toBe(true);
    });

    it("restores a key without pending events", async () => {
      const harness = createHarness();
      await seed(harness);
      expect((await harness.registry.findById(entityIdFactory(1)))?.pullEvents()).toEqual([]);
    });

    it("lets a tenant scoped repository read its own key", async () => {
      const harness = createHarness();
      await seed(harness);
      expect((await harness.scopedTo(tenantIdFactory(1)).findById(entityIdFactory(1)))?.name).toBe("First");
    });

    it("hides a key of another tenant from a tenant scoped repository looking up by id", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.scopedTo(tenantIdFactory(1)).findById(entityIdFactory(2))).toBeUndefined();
    });

    it("hides a key of another tenant from a tenant scoped repository looking up by prefix", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.scopedTo(tenantIdFactory(1)).findByPrefix(second.keyPrefix)).toBeUndefined();
    });

    it("refuses a write outside the scope of a tenant scoped repository", async () => {
      const harness = createHarness();
      const scoped = harness.scopedTo(tenantIdFactory(1));
      const caught = await Promise.resolve()
        .then(() => scoped.save(second))
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(caught).toBeInstanceOf(Error);
    });
  });
}
