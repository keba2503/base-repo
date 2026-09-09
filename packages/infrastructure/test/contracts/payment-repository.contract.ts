import { describe, expect, it } from "bun:test";
import type { PaymentRepository } from "@base/application";
import type { Payment, TenantId } from "@base/domain";
import { entityIdFactory } from "../factories/identity";
import { paymentFactory } from "../factories/payment";
import { tenantIdFactory } from "../factories/tenant";

export type PaymentRepositoryHarness = {
  readonly registry: PaymentRepository;
  scopedTo(tenantId: TenantId): PaymentRepository;
};

const ownTenant = tenantIdFactory(1);
const otherTenant = tenantIdFactory(2);

function idOf(payment: Payment | undefined): string | undefined {
  return payment?.id;
}

export function describePaymentRepositoryContract(
  name: string,
  createHarness: () => PaymentRepositoryHarness,
): void {
  describe(`${name} satisfies the PaymentRepository contract`, () => {
    it("finds a saved payment by id", async () => {
      const harness = createHarness();
      const payment = paymentFactory({ id: entityIdFactory(1) });
      await harness.registry.save(payment);
      expect(idOf(await harness.registry.findById(entityIdFactory(1)))).toBe(payment.id);
    });

    it("returns nothing for an unknown id", async () => {
      const harness = createHarness();
      expect(await harness.registry.findById(entityIdFactory(99))).toBeUndefined();
    });

    it("persists a status transition", async () => {
      const harness = createHarness();
      const payment = paymentFactory({ id: entityIdFactory(1) });
      await harness.registry.save(payment);
      payment.cancel(new Date("2026-01-16T10:00:00.000Z"));
      await harness.registry.save(payment);
      const stored = await harness.registry.findById(entityIdFactory(1));
      expect(stored?.status).toBe("canceled");
    });

    it("restores a payment without pending events", async () => {
      const harness = createHarness();
      await harness.registry.save(paymentFactory({ id: entityIdFactory(1) }));
      expect((await harness.registry.findById(entityIdFactory(1)))?.pullEvents()).toEqual([]);
    });

    it("returns the same payment through a locked read as an unlocked one would", async () => {
      const harness = createHarness();
      const payment = paymentFactory({ id: entityIdFactory(1) });
      await harness.registry.save(payment);
      const unlocked = await harness.registry.findById(entityIdFactory(1));
      const locked = await harness.registry.findByIdForUpdate(entityIdFactory(1));
      expect(idOf(locked)).toBe(idOf(unlocked));
    });

    it("hides another tenant's payment from a tenant scoped repository through the locked read too", async () => {
      const harness = createHarness();
      await harness.registry.save(paymentFactory({ id: entityIdFactory(1), tenantId: otherTenant }));
      const scoped = harness.scopedTo(ownTenant);
      expect(await scoped.findByIdForUpdate(entityIdFactory(1))).toBeUndefined();
    });

    it("lets a tenant scoped repository read its own payment", async () => {
      const harness = createHarness();
      const scoped = harness.scopedTo(ownTenant);
      const payment = paymentFactory({ id: entityIdFactory(1), tenantId: ownTenant });
      await scoped.save(payment);
      expect(idOf(await scoped.findById(entityIdFactory(1)))).toBe(payment.id);
    });

    it("hides another tenant's payment from a tenant scoped repository", async () => {
      const harness = createHarness();
      await harness.registry.save(paymentFactory({ id: entityIdFactory(1), tenantId: otherTenant }));
      const scoped = harness.scopedTo(ownTenant);
      expect(await scoped.findById(entityIdFactory(1))).toBeUndefined();
    });

    it("lets the registry scope see a payment saved by any tenant", async () => {
      const harness = createHarness();
      await harness.scopedTo(ownTenant).save(paymentFactory({ id: entityIdFactory(1), tenantId: ownTenant }));
      await harness.scopedTo(otherTenant).save(paymentFactory({ id: entityIdFactory(2), tenantId: otherTenant }));
      expect(idOf(await harness.registry.findById(entityIdFactory(1)))).toBe(entityIdFactory(1));
      expect(idOf(await harness.registry.findById(entityIdFactory(2)))).toBe(entityIdFactory(2));
    });

    it("refuses a write outside the scope of a tenant scoped repository", async () => {
      const harness = createHarness();
      const scoped = harness.scopedTo(ownTenant);
      const rejected = Promise.resolve().then(() =>
        scoped.save(paymentFactory({ id: entityIdFactory(1), tenantId: otherTenant })),
      );
      const caught = await rejected.then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(Error);
    });
  });
}
