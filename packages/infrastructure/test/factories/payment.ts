import { Money, Payment, isOk, type PaymentSnapshot } from "@base/domain";
import type { StartPaymentInstruction } from "@base/application";
import { entityIdFactory } from "./identity";
import { tenantIdFactory } from "./tenant";

export function paymentMoneyFactory(amountMinor = 1200, currency = "EUR"): Money {
  const created = Money.create(amountMinor, currency);
  if (!isOk(created)) throw new Error("The payment money factory produced an invalid amount");
  return created.value;
}

export function paymentSnapshotFactory(overrides: Partial<PaymentSnapshot> = {}): PaymentSnapshot {
  return {
    id: entityIdFactory(40),
    tenantId: tenantIdFactory(1),
    initiatedBy: entityIdFactory(10),
    amountMinor: 1200,
    currency: "EUR",
    description: "Consulta de seguimiento",
    provider: "memory",
    status: "pending",
    providerReference: null,
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    resolvedAt: null,
    failureReason: null,
    ...overrides,
  };
}

export function paymentFactory(overrides: Partial<PaymentSnapshot> = {}): Payment {
  const restored = Payment.restore(paymentSnapshotFactory(overrides));
  if (!isOk(restored)) {
    throw new Error(`The payment factory produced an invalid payment, received ${restored.error.code}`);
  }
  return restored.value;
}

export function startPaymentInstructionFactory(
  overrides: Partial<StartPaymentInstruction> = {},
): StartPaymentInstruction {
  return {
    paymentId: entityIdFactory(40),
    tenantId: tenantIdFactory(1),
    amount: paymentMoneyFactory(),
    description: "Consulta de seguimiento",
    returnUrl: "https://acme.example/billing/return",
    cancelUrl: "https://acme.example/billing/cancel",
    idempotencyKey: "payment.start:idempotency-1",
    ...overrides,
  };
}
