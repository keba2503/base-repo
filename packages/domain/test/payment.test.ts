import { describe, expect, it } from "bun:test";
import { isOk } from "../src/kernel/result";
import { Payment, paymentFieldClassifications, type PaymentSnapshot } from "../src/billing/payment";
import { paymentSnapshotFactory } from "./factories/billing";

const createdAt = new Date("2026-01-15T10:00:00.000Z");
const later = new Date("2026-01-16T10:00:00.000Z");

function createFailureCode(
  snapshot: Omit<PaymentSnapshot, "status" | "providerReference" | "settledAt" | "failureReason">,
): string {
  const result = Payment.create(snapshot);
  if (isOk(result)) throw new Error("Expected the payment to be rejected");
  return result.error.code;
}

function pendingPayment(overrides: Partial<PaymentSnapshot> = {}): Payment {
  const snapshot = paymentSnapshotFactory(overrides);
  const result = Payment.create(snapshot);
  if (!isOk(result)) throw new Error(`Expected the payment to be accepted, received ${result.error.code}`);
  return result.value;
}

describe("payment creation", () => {
  it("starts pending", () => {
    expect(pendingPayment().status).toBe("pending");
  });

  it("records a started event", () => {
    const payment = pendingPayment();
    expect(payment.pullEvents()).toEqual([
      {
        name: "payment.started",
        tenantId: payment.tenantId,
        occurredAt: createdAt,
        payload: { paymentId: payment.id, amountMinor: payment.amountMinor, currency: payment.currency },
      },
    ]);
  });

  it("rejects an empty description", () => {
    expect(createFailureCode(paymentSnapshotFactory({ description: " " }))).toBe("payment.description.length");
  });

  it("rejects a description over the maximum length", () => {
    expect(createFailureCode(paymentSnapshotFactory({ description: "a".repeat(141) }))).toBe(
      "payment.description.length",
    );
  });

  it("rejects an invalid amount", () => {
    expect(createFailureCode(paymentSnapshotFactory({ amountMinor: 0 }))).toBe("money.amountMinor.zero");
  });

  it("rejects an unknown currency", () => {
    expect(createFailureCode(paymentSnapshotFactory({ currency: "XXX" }))).toBe("money.currency.unsupported");
  });

  it("exposes the amount as money", () => {
    const payment = pendingPayment({ amountMinor: 2_500, currency: "USD" });
    expect([payment.money.amountMinor, payment.money.currency]).toEqual([2_500, "USD"]);
  });
});

describe("payment settlement", () => {
  it("moves from pending to succeeded", () => {
    const payment = pendingPayment();
    const result = payment.settle("pi_123", later);
    expect([isOk(result), payment.status, payment.providerReference, payment.settledAt]).toEqual([
      true,
      "succeeded",
      "pi_123",
      later,
    ]);
  });

  it("records a succeeded event", () => {
    const payment = pendingPayment();
    payment.pullEvents();
    payment.settle("pi_123", later);
    expect(payment.pullEvents()).toEqual([
      {
        name: "payment.succeeded",
        tenantId: payment.tenantId,
        occurredAt: later,
        payload: { paymentId: payment.id, providerReference: "pi_123" },
      },
    ]);
  });

  it("treats a repeated webhook with the same provider reference as a no-op", () => {
    const payment = pendingPayment();
    payment.settle("pi_123", later);
    payment.pullEvents();
    const result = payment.settle("pi_123", later);
    expect([isOk(result), payment.pullEvents()]).toEqual([true, []]);
  });

  it("refuses to settle again with a different provider reference", () => {
    const payment = pendingPayment();
    payment.settle("pi_123", later);
    const result = payment.settle("pi_456", later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.settle.referenceMismatch");
  });

  it("refuses to settle a failed payment", () => {
    const payment = pendingPayment();
    payment.fail("card_declined", later);
    const result = payment.settle("pi_123", later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.settle.terminal");
  });

  it("refuses to settle a canceled payment", () => {
    const payment = pendingPayment();
    payment.cancel(later);
    const result = payment.settle("pi_123", later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.settle.terminal");
  });
});

describe("payment failure", () => {
  it("moves from pending to failed", () => {
    const payment = pendingPayment();
    const result = payment.fail("card_declined", later);
    expect([isOk(result), payment.status, payment.failureReason, payment.settledAt]).toEqual([
      true,
      "failed",
      "card_declined",
      later,
    ]);
  });

  it("records a failed event", () => {
    const payment = pendingPayment();
    payment.pullEvents();
    payment.fail("card_declined", later);
    expect(payment.pullEvents()).toEqual([
      {
        name: "payment.failed",
        tenantId: payment.tenantId,
        occurredAt: later,
        payload: { paymentId: payment.id, reason: "card_declined" },
      },
    ]);
  });

  it("treats a repeated webhook with the same reason as a no-op", () => {
    const payment = pendingPayment();
    payment.fail("card_declined", later);
    payment.pullEvents();
    const result = payment.fail("card_declined", later);
    expect([isOk(result), payment.pullEvents()]).toEqual([true, []]);
  });

  it("refuses to fail again with a different reason", () => {
    const payment = pendingPayment();
    payment.fail("card_declined", later);
    const result = payment.fail("insufficient_funds", later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.fail.reasonMismatch");
  });

  it("refuses to fail a succeeded payment", () => {
    const payment = pendingPayment();
    payment.settle("pi_123", later);
    const result = payment.fail("card_declined", later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.fail.terminal");
  });

  it("refuses to fail a canceled payment", () => {
    const payment = pendingPayment();
    payment.cancel(later);
    const result = payment.fail("card_declined", later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.fail.terminal");
  });
});

describe("payment cancellation", () => {
  it("moves from pending to canceled", () => {
    const payment = pendingPayment();
    const result = payment.cancel(later);
    expect([isOk(result), payment.status, payment.settledAt]).toEqual([true, "canceled", later]);
  });

  it("records a canceled event", () => {
    const payment = pendingPayment();
    payment.pullEvents();
    payment.cancel(later);
    expect(payment.pullEvents()).toEqual([
      { name: "payment.canceled", tenantId: payment.tenantId, occurredAt: later, payload: { paymentId: payment.id } },
    ]);
  });

  it("treats a repeated cancellation as a no-op", () => {
    const payment = pendingPayment();
    payment.cancel(later);
    payment.pullEvents();
    const result = payment.cancel(later);
    expect([isOk(result), payment.pullEvents()]).toEqual([true, []]);
  });

  it("refuses to cancel a succeeded payment", () => {
    const payment = pendingPayment();
    payment.settle("pi_123", later);
    const result = payment.cancel(later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.cancel.terminal");
  });

  it("refuses to cancel a failed payment", () => {
    const payment = pendingPayment();
    payment.fail("card_declined", later);
    const result = payment.cancel(later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.cancel.terminal");
  });
});

describe("payment restoration", () => {
  it("does not record an event", () => {
    const result = Payment.restore(paymentSnapshotFactory());
    if (!isOk(result)) throw new Error("Expected the payment to be accepted");
    expect(result.value.pullEvents()).toEqual([]);
  });

  it("restores a succeeded payment as succeeded", () => {
    const result = Payment.restore(
      paymentSnapshotFactory({ status: "succeeded", providerReference: "pi_123", settledAt: later }),
    );
    if (!isOk(result)) throw new Error("Expected the payment to be accepted");
    expect([result.value.status, result.value.providerReference]).toEqual(["succeeded", "pi_123"]);
  });
});

describe("payment data classification", () => {
  it("declares the description as personal", () => {
    expect(paymentFieldClassifications.description).toBe("personal");
  });

  it("declares the provider reference as carrying no personal data", () => {
    expect(paymentFieldClassifications.providerReference).toBe("none");
  });
});
