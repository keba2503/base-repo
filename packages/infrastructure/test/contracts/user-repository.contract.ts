import { describe, expect, it } from "bun:test";
import type { UserRepository } from "@base/application";
import type { TenantId } from "@base/domain";
import { emailFactory, entityIdFactory, userFactory } from "../factories/identity";
import { tenantIdFactory } from "../factories/tenant";

export type UserRepositoryHarness = {
  readonly registry: UserRepository;
  scopedTo(tenantId: TenantId): UserRepository;
};

const first = userFactory({ id: entityIdFactory(1), tenantId: tenantIdFactory(1), email: emailFactory("first@example.com") });
const second = userFactory({ id: entityIdFactory(2), tenantId: tenantIdFactory(2), email: emailFactory("second@example.com") });

async function seed(harness: UserRepositoryHarness): Promise<void> {
  await harness.registry.save(first);
  await harness.registry.save(second);
}

export function describeUserRepositoryContract(name: string, createHarness: () => UserRepositoryHarness): void {
  describe(`${name} satisfies the UserRepository contract`, () => {
    it("finds a saved user by id", async () => {
      const harness = createHarness();
      await seed(harness);
      expect((await harness.registry.findById(entityIdFactory(1)))?.displayName).toBe("Karen");
    });

    it("finds a saved user by email", async () => {
      const harness = createHarness();
      await seed(harness);
      expect((await harness.registry.findByEmail(emailFactory("second@example.com")))?.id).toBe(entityIdFactory(2));
    });

    it("returns nothing for an unknown id", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.registry.findById(entityIdFactory(99))).toBeUndefined();
    });

    it("returns nothing for an unknown email", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.registry.findByEmail(emailFactory("nobody@example.com"))).toBeUndefined();
    });

    it("replaces a user saved twice", async () => {
      const harness = createHarness();
      await seed(harness);
      await harness.registry.save(userFactory({ id: entityIdFactory(1), email: emailFactory("first@example.com"), displayName: "Karen B." }));
      expect((await harness.registry.findById(entityIdFactory(1)))?.displayName).toBe("Karen B.");
    });

    it("restores a user without pending events", async () => {
      const harness = createHarness();
      await seed(harness);
      expect((await harness.registry.findById(entityIdFactory(1)))?.pullEvents()).toEqual([]);
    });

    it("lets a tenant scoped repository read a user of its tenant", async () => {
      const harness = createHarness();
      await seed(harness);
      expect((await harness.scopedTo(tenantIdFactory(1)).findById(entityIdFactory(1)))?.id).toBe(entityIdFactory(1));
    });

    it("hides a user of another tenant from a tenant scoped repository looking up by id", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.scopedTo(tenantIdFactory(1)).findById(entityIdFactory(2))).toBeUndefined();
    });

    it("hides a user of another tenant from a tenant scoped repository looking up by email", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.scopedTo(tenantIdFactory(1)).findByEmail(emailFactory("second@example.com"))).toBeUndefined();
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
