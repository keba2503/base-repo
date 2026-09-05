import { describe, expect, it } from "bun:test";
import type { MembershipRepository } from "@base/application";
import type { TenantId } from "@base/domain";
import { entityIdFactory, membershipFactory } from "../factories/identity";
import { tenantIdFactory } from "../factories/tenant";

export type MembershipRepositoryHarness = {
  readonly registry: MembershipRepository;
  scopedTo(tenantId: TenantId): MembershipRepository;
};

const userId = entityIdFactory(10);
const otherUserId = entityIdFactory(11);

const inFirstTenant = membershipFactory({ userId, tenantId: tenantIdFactory(1), role: "owner" });
const inSecondTenant = membershipFactory({ userId, tenantId: tenantIdFactory(2), role: "member" });
const otherUser = membershipFactory({ userId: otherUserId, tenantId: tenantIdFactory(1), role: "admin" });

async function seed(harness: MembershipRepositoryHarness): Promise<void> {
  await harness.registry.save(inFirstTenant);
  await harness.registry.save(inSecondTenant);
  await harness.registry.save(otherUser);
}

export function describeMembershipRepositoryContract(
  name: string,
  createHarness: () => MembershipRepositoryHarness,
): void {
  describe(`${name} satisfies the MembershipRepository contract`, () => {
    it("lists every membership of a user at registry level", async () => {
      const harness = createHarness();
      await seed(harness);
      const found = await harness.registry.findByUserId(userId);
      expect(found.map((membership) => membership.tenantId)).toEqual([tenantIdFactory(1), tenantIdFactory(2)]);
    });

    it("keeps the order in which memberships were granted", async () => {
      const harness = createHarness();
      await harness.registry.save(inSecondTenant);
      await harness.registry.save(inFirstTenant);
      const found = await harness.registry.findByUserId(userId);
      expect(found.map((membership) => membership.tenantId)).toEqual([tenantIdFactory(2), tenantIdFactory(1)]);
    });

    it("returns an empty list for an unknown user", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.registry.findByUserId(entityIdFactory(99))).toEqual([]);
    });

    it("replaces the role when the same membership is saved again", async () => {
      const harness = createHarness();
      await seed(harness);
      await harness.registry.save(membershipFactory({ userId, tenantId: tenantIdFactory(1), role: "admin" }));
      const found = await harness.registry.findByUserId(userId);
      expect(found.map((membership) => membership.role)).toEqual(["admin", "member"]);
    });

    it("only returns the membership of its own tenant when tenant scoped", async () => {
      const harness = createHarness();
      await seed(harness);
      const found = await harness.scopedTo(tenantIdFactory(1)).findByUserId(userId);
      expect(found.map((membership) => membership.role)).toEqual(["owner"]);
    });

    it("hides a user of another tenant from a tenant scoped repository", async () => {
      const harness = createHarness();
      await seed(harness);
      expect(await harness.scopedTo(tenantIdFactory(3)).findByUserId(userId)).toEqual([]);
    });

    it("refuses a write outside the scope of a tenant scoped repository", async () => {
      const harness = createHarness();
      const scoped = harness.scopedTo(tenantIdFactory(1));
      const caught = await Promise.resolve()
        .then(() => scoped.save(inSecondTenant))
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(caught).toBeInstanceOf(Error);
    });
  });
}
