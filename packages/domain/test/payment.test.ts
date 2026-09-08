import { describe, expect, it } from "bun:test";
import { isOk } from "../src/kernel/result";
import { Money } from "../src/billing/money";
import { Payment, paymentFieldClassifications, type PaymentSnapshot } from "../src/billing/payment";
import { paymentSnapshotFactory } from "./factories/billing";

const createdAt = new Date("2026-01-15T10:00:00.000Z");
const later = new Date("2026-01-16T10:00:00.000Z");

function moneyOf(amountMinor: number, currency: string): Money {
  const result = Money.create(amountMinor, currency);
  if (!isOk(result)) throw new Error("Expected the amount to be accepted");
  return result.value;
}

function createFailureCode(
  snapshot: Omit<PaymentSnapshot, "status" | "providerReference" | "resolvedAt" | "failureReason">,
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
    expect(createFailureCode(paymentSnapshotFactory({ amountMinor: 0 }))).toBe("money.amountMinor.notPositive");
  });

  it("rejects an unknown currency", () => {
    expect(createFailureCode(paymentSnapshotFactory({ currency: "XXX" }))).toBe("money.currency.unsupported");
  });

  it("rejects an empty provider", () => {
    expect(createFailureCode(paymentSnapshotFactory({ provider: "" }))).toBe("payment.provider.invalid");
  });

  it("rejects a provider that is not lowercase", () => {
    expect(createFailureCode(paymentSnapshotFactory({ provider: "Stripe" }))).toBe("payment.provider.invalid");
  });

  it("rejects a provider over the maximum length", () => {
    expect(createFailureCode(paymentSnapshotFactory({ provider: "a".repeat(33) }))).toBe("payment.provider.invalid");
  });

  it("exposes the amount as money", () => {
    const payment = pendingPayment({ amountMinor: 2_500, currency: "USD" });
    expect([payment.money.amountMinor, payment.money.currency]).toEqual([2_500, "USD"]);
  });
});

describe("payment settlement", () => {
  it("moves from pending to succeeded", () => {
    const payment = pendingPayment();
    const result = payment.settle("pi_123", payment.money, later);
    expect([isOk(result) && result.value, payment.status, payment.providerReference, payment.resolvedAt]).toEqual([
      "applied",
      "succeeded",
      "pi_123",
      later,
    ]);
  });

  it("records a succeeded event", () => {
    const payment = pendingPayment();
    payment.pullEvents();
    payment.settle("pi_123", payment.money, later);
    expect(payment.pullEvents()).toEqual([
      {
        name: "payment.succeeded",
        tenantId: payment.tenantId,
        occurredAt: later,
        payload: { paymentId: payment.id, providerReference: "pi_123" },
      },
    ]);
  });

  it("returns applied then alreadyApplied for a repeated webhook, recording exactly one event", () => {
    const payment = pendingPayment();
    payment.pullEvents();
    const first = payment.settle("pi_123", payment.money, later);
    const second = payment.settle("pi_123", payment.money, later);
    expect([isOk(first) && first.value, isOk(second) && second.value, payment.pullEvents().length]).toEqual([
      "applied",
      "alreadyApplied",
      1,
    ]);
  });

  it("refuses to settle again with a different provider reference", () => {
    const payment = pendingPayment();
    payment.settle("pi_123", payment.money, later);
    const result = payment.settle("pi_456", payment.money, later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.settle.referenceMismatch");
  });

  it("refuses to settle a failed payment", () => {
    const payment = pendingPayment();
    payment.fail("card_declined", later);
    const result = payment.settle("pi_123", payment.money, later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.settle.terminal");
  });

  it("refuses to settle a canceled payment", () => {
    const payment = pendingPayment();
    payment.cancel(later);
    const result = payment.settle("pi_123", payment.money, later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.settle.terminal");
  });

  it("refuses to settle with a paid amount different in number and leaves the status pending", () => {
    const payment = pendingPayment({ amountMinor: 1_999, currency: "EUR" });
    const result = payment.settle("pi_123", moneyOf(2_000, "EUR"), later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect([result.error.code, payment.status]).toEqual(["payment.settle.amountMismatch", "pending"]);
  });

  it("refuses to settle with a paid amount equal in number but different in currency", () => {
    const payment = pendingPayment({ amountMinor: 1_999, currency: "EUR" });
    const result = payment.settle("pi_123", moneyOf(1_999, "USD"), later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect([result.error.code, payment.status]).toEqual(["payment.settle.amountMismatch", "pending"]);
  });

  it("refuses an empty provider reference", () => {
    const payment = pendingPayment();
    const result = payment.settle(" ", payment.money, later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.code).toBe("payment.settle.referenceEmpty");
  });
});

describe("payment failure", () => {
  it("moves from pending to failed", () => {
    const payment = pendingPayment();
    const result = payment.fail("card_declined", later);
    expect([isOk(result) && result.value, payment.status, payment.failureReason, payment.resolvedAt]).toEqual([
      "applied",
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

  it("returns applied then alreadyApplied for a repeated failure, recording exactly one event", () => {
    const payment = pendingPayment();
    payment.pullEvents();
    const first = payment.fail("card_declined", later);
    const second = payment.fail("card_declined", later);
    expect([isOk(first) && first.value, isOk(second) && second.value, payment.pullEvents().length]).toEqual([
      "applied",
      "alreadyApplied",
      1,
    ]);
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
    payment.settle("pi_123", payment.money, later);
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
    expect([isOk(result) && result.value, payment.status, payment.resolvedAt]).toEqual(["applied", "canceled", later]);
  });

  it("records a canceled event", () => {
    const payment = pendingPayment();
    payment.pullEvents();
    payment.cancel(later);
    expect(payment.pullEvents()).toEqual([
      { name: "payment.canceled", tenantId: payment.tenantId, occurredAt: later, payload: { paymentId: payment.id } },
    ]);
  });

  it("returns applied then alreadyApplied for a repeated cancellation, recording exactly one event", () => {
    const payment = pendingPayment();
    payment.pullEvents();
    const first = payment.cancel(later);
    const second = payment.cancel(later);
    expect([isOk(first) && first.value, isOk(second) && second.value, payment.pullEvents().length]).toEqual([
      "applied",
      "alreadyApplied",
      1,
    ]);
  });

  it("refuses to cancel a succeeded payment", () => {
    const payment = pendingPayment();
    payment.settle("pi_123", payment.money, later);
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

describe("payment terminal state contradictions", () => {
  it("refuses to fail a succeeded payment", () => {
    const payment = pendingPayment();
    payment.settle("pi_123", payment.money, later);
    const result = payment.fail("card_declined", later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.kind).toBe("conflict");
  });

  it("refuses to succeed a failed payment", () => {
    const payment = pendingPayment();
    payment.fail("card_declined", later);
    const result = payment.settle("pi_123", payment.money, later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.kind).toBe("conflict");
  });

  it("refuses to succeed a canceled payment", () => {
    const payment = pendingPayment();
    payment.cancel(later);
    const result = payment.settle("pi_123", payment.money, later);
    if (isOk(result)) throw new Error("Expected the transition to be rejected");
    expect(result.error.kind).toBe("conflict");
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
      paymentSnapshotFactory({ status: "succeeded", providerReference: "pi_123", resolvedAt: later }),
    );
    if (!isOk(result)) throw new Error("Expected the payment to be accepted");
    expect([result.value.status, result.value.providerReference]).toEqual(["succeeded", "pi_123"]);
  });

  it("round-trips through a snapshot", () => {
    const payment = pendingPayment();
    payment.settle("pi_123", payment.money, later);
    const snapshot = payment.toSnapshot();
    const restored = Payment.restore(snapshot);
    if (!isOk(restored)) throw new Error("Expected the payment to be accepted");
    expect(restored.value.toSnapshot()).toEqual(snapshot);
  });

  it("rejects a snapshot whose amount is not a positive safe integer", () => {
    const result = Payment.restore(paymentSnapshotFactory({ amountMinor: -5 }));
    if (isOk(result)) throw new Error("Expected the payment to be rejected");
    expect(result.error.code).toBe("money.amountMinor.notPositive");
  });
});

describe("payment data classification", () => {
  it("declares the description as personal", () => {
    expect(paymentFieldClassifications.description).toBe("personal");
  });

  it("declares the provider reference as personal", () => {
    expect(paymentFieldClassifications.providerReference).toBe("personal");
  });

  it("declares the initiator and provider as carrying no personal data", () => {
    expect([paymentFieldClassifications.initiatedBy, paymentFieldClassifications.provider]).toEqual(["none", "none"]);
  });
});

describe("attaching a provider reference", () => {
  it("takes the reference while the payment is still pending", () => {
    const payment = pendingPayment();
    const attached = payment.attachProviderReference("cs_test_1");
    expect(isOk(attached) && attached.value).toBe("applied");
    expect(payment.providerReference).toBe("cs_test_1");
  });

  it("leaves the payment pending", () => {
    const payment = pendingPayment();
    payment.attachProviderReference("cs_test_1");
    expect(payment.status).toBe("pending");
  });

  it("records nothing, because carrying a provider reference is not a business fact", () => {
    const payment = pendingPayment();
    payment.pullEvents();
    payment.attachProviderReference("cs_test_1");
    expect(payment.pullEvents()).toEqual([]);
  });

  it("accepts the same reference twice without applying it again", () => {
    const payment = pendingPayment();
    payment.attachProviderReference("cs_test_1");
    const again = payment.attachProviderReference("cs_test_1");
    expect(isOk(again) && again.value).toBe("alreadyApplied");
  });

  it("refuses a second, different reference", () => {
    const payment = pendingPayment();
    payment.attachProviderReference("cs_test_1");
    const other = payment.attachProviderReference("cs_test_2");
    if (isOk(other)) throw new Error("Expected a failure");
    expect([other.error.kind, other.error.code]).toEqual(["conflict", "payment.providerReference.alreadyAttached"]);
  });

  it("refuses an empty reference", () => {
    const payment = pendingPayment();
    const empty = payment.attachProviderReference("");
    if (isOk(empty)) throw new Error("Expected a failure");
    expect(empty.error.kind).toBe("invariantViolation");
  });
});
