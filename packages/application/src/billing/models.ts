import { resourceOfAction, type EntityId, type PaymentStatus } from "@base/domain";
import type { Actor } from "../kernel/actor";
import type { PaymentHandoff, ProviderNotification, ProviderPaymentEventKind } from "./ports/payment-gateway";

export type PaymentReturnUrls = {
  readonly returnUrl: string;
  readonly cancelUrl: string;
};

export type PaymentReturnUrlFactory = (paymentId: EntityId) => PaymentReturnUrls;

export type StartPaymentRequest = {
  readonly actor: Actor;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
};

export type StartPaymentResponse = {
  readonly paymentId: string;
  readonly status: PaymentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly handoff: PaymentHandoff;
};

export type RecordProviderPaymentEventRequest = {
  readonly actor: Actor;
  readonly notification: ProviderNotification;
};

export type RecordProviderPaymentEventResponse = {
  readonly applied: boolean;
  readonly replayed: boolean;
  readonly paymentId: string | undefined;
  readonly status: PaymentStatus | undefined;
  readonly kind: ProviderPaymentEventKind;
};

export const startPaymentAction = "payments:start";
export const paymentResource = resourceOfAction(startPaymentAction);

export const recordProviderPaymentEventAction = "payments:recordProviderEvent";

export const paymentProviderUnavailableCode = "payment.provider.unavailable";
export const paymentInstructionInvalidCode = "payment.instruction.invalid";
export const paymentNotificationSignatureInvalidCode = "payment.notification.signatureInvalid";
export const paymentNotificationMalformedCode = "payment.notification.malformed";
export const paymentIdempotencyConflictCode = "payment.idempotency.conflict";
export const paymentProviderMalformedResponseCode = "payment.provider.malformedResponse";
export const paymentEventAmountMissingCode = "payment.event.amountMissing";
export const paymentEventReasonMissingCode = "payment.event.reasonMissing";
export const paymentNotificationTenantMismatchCode = "payment.notification.tenantMismatch";
