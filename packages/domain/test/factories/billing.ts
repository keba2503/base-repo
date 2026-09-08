import type { PaymentSnapshot } from "../../src/billing/payment";
import { entityIdFactory } from "./identity";
import { tenantIdFactory } from "./tenant";

export function paymentSnapshotFactory(overrides: Partial<PaymentSnapshot> = {}): PaymentSnapshot {
  return {
    id: entityIdFactory(40),
    tenantId: tenantIdFactory(1),
    amountMinor: 1_999,
    currency: "EUR",
    description: "Consulta de seguimiento",
    status: "pending",
    providerReference: null,
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    settledAt: null,
    failureReason: null,
    ...overrides,
  };
}
