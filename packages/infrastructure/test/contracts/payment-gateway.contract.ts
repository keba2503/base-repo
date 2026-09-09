import { describe, expect, it } from "bun:test";
import type { PaymentGateway, PaymentHandoff, ProviderNotification, StartPaymentInstruction } from "@base/application";
import { isErr, isOk, type EntityId, type Money } from "@base/domain";

export type PaymentNotificationFixture = {
  readonly paymentId: EntityId;
  readonly tenantId?: string;
  readonly providerReference: string;
  readonly amount?: Money;
  readonly reason?: string;
};

export type PaymentGatewayHarness = {
  readonly gateway: PaymentGateway;
  readonly instruction: StartPaymentInstruction;
  notificationOf(
    kind: "succeeded" | "failed" | "canceled",
    fixture: PaymentNotificationFixture,
  ): ProviderNotification;
  tamperedNotification(fixture: PaymentNotificationFixture): ProviderNotification;
  staleNotification(fixture: PaymentNotificationFixture): ProviderNotification;
  unsupportedNotification(fixture: PaymentNotificationFixture): ProviderNotification;
  malformedNotification(): ProviderNotification;
};

function urlOf(handoff: PaymentHandoff): string {
  return handoff.kind === "redirect" ? handoff.url : handoff.action;
}

export function describePaymentGatewayContract(name: string, createHarness: () => PaymentGatewayHarness): void {
  describe(`${name} satisfies the PaymentGateway contract`, () => {
    it("returns a handoff carrying a non-empty provider reference", async () => {
      const harness = createHarness();
      const started = await harness.gateway.start(harness.instruction);
      if (!isOk(started)) throw new Error(`Expected a handoff, received ${started.error.code}`);
      expect(started.value.providerReference.length).toBeGreaterThan(0);
    });

    it("returns a handoff pointing at an absolute https destination", async () => {
      const harness = createHarness();
      const started = await harness.gateway.start(harness.instruction);
      if (!isOk(started)) throw new Error(`Expected a handoff, received ${started.error.code}`);
      expect(new URL(urlOf(started.value)).protocol).toBe("https:");
    });

    it("returns a handoff that expires strictly after the instruction was issued", async () => {
      const harness = createHarness();
      const issuedAt = new Date();
      const started = await harness.gateway.start(harness.instruction);
      if (!isOk(started)) throw new Error(`Expected a handoff, received ${started.error.code}`);
      expect(started.value.expiresAt.getTime()).toBeGreaterThan(issuedAt.getTime());
    });

    it("returns the same provider reference for a repeated idempotency key", async () => {
      const harness = createHarness();
      const first = await harness.gateway.start(harness.instruction);
      const second = await harness.gateway.start(harness.instruction);
      if (!isOk(first) || !isOk(second)) throw new Error("Expected two handoffs");
      expect(second.value.providerReference).toBe(first.value.providerReference);
    });

    it("returns a different provider reference for a different idempotency key", async () => {
      const harness = createHarness();
      const first = await harness.gateway.start(harness.instruction);
      const second = await harness.gateway.start({
        ...harness.instruction,
        idempotencyKey: `${harness.instruction.idempotencyKey}-other`,
      });
      if (!isOk(first) || !isOk(second)) throw new Error("Expected two handoffs");
      expect(second.value.providerReference).not.toBe(first.value.providerReference);
    });

    it("interprets a signed success notification as succeeded, with the payment id and the notified amount", async () => {
      const harness = createHarness();
      const started = await harness.gateway.start(harness.instruction);
      if (!isOk(started)) throw new Error(`Expected a handoff, received ${started.error.code}`);
      const notification = harness.notificationOf("succeeded", {
        paymentId: harness.instruction.paymentId,
        providerReference: started.value.providerReference,
        amount: harness.instruction.amount,
      });
      const interpreted = await harness.gateway.interpret(notification);
      if (!isOk(interpreted)) throw new Error(`Expected an event, received ${interpreted.error.code}`);
      expect(interpreted.value.kind).toBe("succeeded");
      expect(interpreted.value.paymentId).toBe(harness.instruction.paymentId);
      expect(interpreted.value.amount).toEqual(harness.instruction.amount);
    });

    it("carries back the tenant id that was in the instruction on a success notification", async () => {
      const harness = createHarness();
      const started = await harness.gateway.start(harness.instruction);
      if (!isOk(started)) throw new Error(`Expected a handoff, received ${started.error.code}`);
      const notification = harness.notificationOf("succeeded", {
        paymentId: harness.instruction.paymentId,
        providerReference: started.value.providerReference,
        amount: harness.instruction.amount,
        tenantId: harness.instruction.tenantId,
      });
      const interpreted = await harness.gateway.interpret(notification);
      if (!isOk(interpreted)) throw new Error(`Expected an event, received ${interpreted.error.code}`);
      expect(interpreted.value.tenantId).toBe(harness.instruction.tenantId);
    });

    it("returns a non-empty provider event id that stays identical for the same notification", async () => {
      const harness = createHarness();
      const notification = harness.notificationOf("succeeded", {
        paymentId: harness.instruction.paymentId,
        providerReference: "pi_contract_test",
        amount: harness.instruction.amount,
      });
      const first = await harness.gateway.interpret(notification);
      const second = await harness.gateway.interpret(notification);
      if (!isOk(first) || !isOk(second)) throw new Error("Expected two events");
      expect(first.value.providerEventId.length).toBeGreaterThan(0);
      expect(second.value.providerEventId).toBe(first.value.providerEventId);
    });

    it("interprets a signed failure notification as failed, with a non-empty reason", async () => {
      const harness = createHarness();
      const notification = harness.notificationOf("failed", {
        paymentId: harness.instruction.paymentId,
        providerReference: "pi_contract_test",
        reason: "card_declined",
      });
      const interpreted = await harness.gateway.interpret(notification);
      if (!isOk(interpreted)) throw new Error(`Expected an event, received ${interpreted.error.code}`);
      expect(interpreted.value.kind).toBe("failed");
      expect(interpreted.value.reason?.length).toBeGreaterThan(0);
    });

    it("interprets a signed expiry notification as canceled", async () => {
      const harness = createHarness();
      const notification = harness.notificationOf("canceled", {
        paymentId: harness.instruction.paymentId,
        providerReference: "pi_contract_test",
      });
      const interpreted = await harness.gateway.interpret(notification);
      if (!isOk(interpreted)) throw new Error(`Expected an event, received ${interpreted.error.code}`);
      expect(interpreted.value.kind).toBe("canceled");
    });

    it("treats an event outside the payment vocabulary as a successful, unsupported outcome", async () => {
      const harness = createHarness();
      const notification = harness.unsupportedNotification({
        paymentId: harness.instruction.paymentId,
        providerReference: "pi_contract_test",
      });
      const interpreted = await harness.gateway.interpret(notification);
      if (!isOk(interpreted)) throw new Error(`Expected a success, received ${interpreted.error.code}`);
      expect(interpreted.value.kind).toBe("unsupported");
    });

    it("refuses a tampered signature", async () => {
      const harness = createHarness();
      const notification = harness.tamperedNotification({
        paymentId: harness.instruction.paymentId,
        providerReference: "pi_contract_test",
      });
      const interpreted = await harness.gateway.interpret(notification);
      if (!isErr(interpreted)) throw new Error("Expected a failure");
      expect([interpreted.error.kind, interpreted.error.code]).toEqual([
        "forbidden",
        "payment.notification.signatureInvalid",
      ]);
    });

    it("refuses a correctly signed but stale notification with the same code as a tampered one", async () => {
      const harness = createHarness();
      const notification = harness.staleNotification({
        paymentId: harness.instruction.paymentId,
        providerReference: "pi_contract_test",
      });
      const interpreted = await harness.gateway.interpret(notification);
      if (!isErr(interpreted)) throw new Error("Expected a failure");
      expect([interpreted.error.kind, interpreted.error.code]).toEqual([
        "forbidden",
        "payment.notification.signatureInvalid",
      ]);
    });

    it("classifies a body that is not the provider's shape as malformed", async () => {
      const harness = createHarness();
      const notification = harness.malformedNotification();
      const interpreted = await harness.gateway.interpret(notification);
      if (!isErr(interpreted)) throw new Error("Expected a failure");
      expect([interpreted.error.kind, interpreted.error.code]).toEqual([
        "invariantViolation",
        "payment.notification.malformed",
      ]);
    });
  });
}
