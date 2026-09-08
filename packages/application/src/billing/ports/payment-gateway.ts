import type { DomainError, EntityId, Money, Result, TenantId } from "@base/domain";

export type StartPaymentInstruction = {
  readonly paymentId: EntityId;
  readonly tenantId: TenantId;
  readonly amount: Money;
  readonly description: string;
  readonly returnUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
};

export type PaymentHandoffRedirect = {
  readonly kind: "redirect";
  readonly url: string;
  readonly providerReference: string;
  readonly expiresAt: Date;
};

export type PaymentHandoffForm = {
  readonly kind: "form";
  readonly action: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly providerReference: string;
  readonly expiresAt: Date;
};

export type PaymentHandoff = PaymentHandoffRedirect | PaymentHandoffForm;

export type ProviderNotification = {
  readonly rawBody: string;
  readonly signature: string;
  readonly receivedAt: Date;
};

export type ProviderPaymentEventKind = "succeeded" | "failed" | "canceled" | "unsupported";

export type ProviderPaymentEvent = {
  readonly providerEventId: string;
  readonly kind: ProviderPaymentEventKind;
  readonly paymentId: string | undefined;
  readonly providerReference: string;
  readonly amount: Money | undefined;
  readonly occurredAt: Date;
  readonly reason: string | undefined;
};

export type PaymentGateway = {
  start(instruction: StartPaymentInstruction): Promise<Result<PaymentHandoff, DomainError>>;
  interpret(notification: ProviderNotification): Promise<Result<ProviderPaymentEvent, DomainError>>;
};
