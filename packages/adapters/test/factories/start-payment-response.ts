import type { StartPaymentResponse } from "@base/application";

export function startPaymentResponseFactory(overrides: Partial<StartPaymentResponse> = {}): StartPaymentResponse {
  return {
    paymentId: "00000000-0000-4000-8000-000000000040",
    status: "pending",
    amountMinor: 1999,
    currency: "EUR",
    handoff: {
      kind: "redirect",
      url: "https://provider.example/checkout/session_123",
      providerReference: "session_123",
      expiresAt: new Date("2026-01-15T10:15:00.000Z"),
    },
    ...overrides,
  };
}
