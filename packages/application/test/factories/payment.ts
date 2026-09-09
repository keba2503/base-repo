import { Money, Payment, isOk, type PaymentSnapshot } from "@base/domain";
import type {
  PaymentHandoffRedirect,
  ProviderNotification,
  ProviderPaymentEvent,
} from "../../src/index";
import { entityIdFactory } from "./identity";
import { tenantIdFactory } from "./actor";

export function moneyFactory(amountMinor = 1_999, currency = "EUR"): Money {
  const created = Money.create(amountMinor, currency);
  if (!isOk(created)) throw new Error("The money factory produced an invalid amount");
  return created.value;
}

export function paymentSnapshotFactory(overrides: Partial<PaymentSnapshot> = {}): PaymentSnapshot {
  return {
    id: entityIdFactory(40),
    tenantId: tenantIdFactory(900),
    initiatedBy: entityIdFactory(10),
    amountMinor: 1_999,
    currency: "EUR",
    description: "Membership renewal",
    provider: "stripe",
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

export function paymentHandoffFactory(overrides: Partial<PaymentHandoffRedirect> = {}): PaymentHandoffRedirect {
  return {
    kind: "redirect",
    url: "https://provider.example.com/checkout/session-1",
    providerReference: "provider-ref-1",
    expiresAt: new Date("2026-01-15T10:15:00.000Z"),
    ...overrides,
  };
}

export function providerPaymentEventFactory(overrides: Partial<ProviderPaymentEvent> = {}): ProviderPaymentEvent {
  return {
    providerEventId: "evt_1",
    kind: "succeeded",
    paymentId: entityIdFactory(40),
    tenantId: undefined,
    providerReference: "provider-ref-1",
    amount: moneyFactory(),
    occurredAt: new Date("2026-01-15T10:05:00.000Z"),
    reason: undefined,
    ...overrides,
  };
}

export function providerNotificationFactory(overrides: Partial<ProviderNotification> = {}): ProviderNotification {
  return {
    rawBody: '{"id":"evt_1"}',
    signature: "valid-signature",
    receivedAt: new Date("2026-01-15T10:05:00.000Z"),
    ...overrides,
  };
}
