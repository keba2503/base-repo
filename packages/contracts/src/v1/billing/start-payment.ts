import { moneyAmountMinorMaximum, paymentDescriptionMaximumLength, paymentDescriptionMinimumLength } from "@base/domain";
import { z } from "zod";
import type { Contract } from "../../kernel/contract";

const startPaymentInput = z.object({
  amountMinor: z.number().int().positive().max(moneyAmountMinorMaximum),
  currency: z.string().regex(/^[A-Z]{3}$/),
  description: z.string().trim().min(paymentDescriptionMinimumLength).max(paymentDescriptionMaximumLength),
});

export type StartPaymentInput = z.infer<typeof startPaymentInput>;

const paymentHandoffRedirectOutput = z.object({
  kind: z.literal("redirect"),
  url: z.url(),
  providerReference: z.string(),
  expiresAt: z.iso.datetime(),
});

const paymentHandoffFormOutput = z.object({
  kind: z.literal("form"),
  action: z.url(),
  fields: z.record(z.string(), z.string()),
  providerReference: z.string(),
  expiresAt: z.iso.datetime(),
});

const paymentHandoffOutput = z.discriminatedUnion("kind", [paymentHandoffRedirectOutput, paymentHandoffFormOutput]);

const startPaymentOutput = z.object({
  paymentId: z.uuid(),
  status: z.enum(["pending", "succeeded", "failed", "canceled"]),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3),
  handoff: paymentHandoffOutput,
});

export type StartPaymentOutput = z.infer<typeof startPaymentOutput>;

export const startPaymentErrorCodes = [
  "authorization.denied",
  "payment.provider.unavailable",
  "payment.instruction.invalid",
  "payment.idempotency.conflict",
  "payment.provider.malformedResponse",
] as const;

export const startPaymentContract: Contract<StartPaymentInput, StartPaymentOutput> = {
  name: "payments.start",
  input: startPaymentInput,
  output: startPaymentOutput,
  errorCodes: startPaymentErrorCodes,
  metadata: {
    auth: "either",
    humanCheck: false,
    idempotent: true,
    rateLimit: "payments-write",
  },
};
