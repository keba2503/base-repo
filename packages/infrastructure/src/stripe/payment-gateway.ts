import {
  paymentIdempotencyConflictCode,
  paymentInstructionInvalidCode,
  paymentNotificationMalformedCode,
  paymentNotificationSignatureInvalidCode,
  paymentProviderMalformedResponseCode,
  paymentProviderUnavailableCode,
  type PaymentGateway,
  type PaymentHandoff,
  type ProviderNotification,
  type ProviderPaymentEvent,
  type ProviderPaymentEventKind,
  type StartPaymentInstruction,
} from "@base/application";
import {
  conflict,
  err,
  forbidden,
  invariantViolation,
  isOk,
  Money,
  ok,
  unavailable,
  type DomainError,
  type Result,
} from "@base/domain";
import type { StripeClient } from "./client";
import { verifyStripeSignature } from "./signature";

export type StripePaymentGatewayOptions = {
  readonly client: StripeClient;
  readonly webhookSecret: string;
};

type StripeCheckoutSessionBody = {
  readonly id: string;
  readonly url: string;
  readonly expires_at: number;
};

type StripeEventBody = {
  readonly id: string;
  readonly type: string;
  readonly created: number;
  readonly object: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formOf(instruction: StartPaymentInstruction): URLSearchParams {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", instruction.returnUrl);
  form.set("cancel_url", instruction.cancelUrl);
  form.set("client_reference_id", instruction.paymentId);
  form.set("metadata[paymentId]", instruction.paymentId);
  form.set("metadata[tenantId]", instruction.tenantId);
  form.set("payment_intent_data[metadata][paymentId]", instruction.paymentId);
  form.set("payment_intent_data[metadata][tenantId]", instruction.tenantId);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", instruction.amount.currency.toLowerCase());
  form.set("line_items[0][price_data][unit_amount]", String(instruction.amount.amountMinor));
  form.set("line_items[0][price_data][product_data][name]", instruction.description);
  return form;
}

function checkoutSessionOf(payload: unknown): StripeCheckoutSessionBody | undefined {
  if (!isRecord(payload)) return undefined;
  const { id, url, expires_at: expiresAt } = payload;
  if (typeof id !== "string" || id.length === 0) return undefined;
  if (typeof url !== "string" || url.length === 0) return undefined;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return undefined;
  return { id, url, expires_at: expiresAt };
}

function errorTypeOf(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const error = payload.error;
  if (!isRecord(error)) return undefined;
  const type = error.type;
  return typeof type === "string" ? type : undefined;
}

function translateFailure(status: number, payload: unknown): DomainError {
  const errorType = errorTypeOf(payload);
  if (errorType === "idempotency_error") {
    return conflict(paymentIdempotencyConflictCode, `Stripe reported an idempotency conflict: ${errorType}`);
  }
  if (status === 400 && errorType === "invalid_request_error") {
    return invariantViolation(paymentInstructionInvalidCode, `Stripe rejected the request: ${errorType}`);
  }
  const suffix = errorType ? ` and error ${errorType}` : "";
  return unavailable(paymentProviderUnavailableCode, `Stripe request failed with status ${String(status)}${suffix}`);
}

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function stripeEventOf(payload: unknown): StripeEventBody | undefined {
  if (!isRecord(payload)) return undefined;
  const { id, type, created, data } = payload;
  if (typeof id !== "string" || id.length === 0) return undefined;
  if (typeof type !== "string" || type.length === 0) return undefined;
  if (typeof created !== "number" || !Number.isFinite(created)) return undefined;
  if (!isRecord(data)) return undefined;
  const object = data.object;
  if (!isRecord(object)) return undefined;
  const objectId = object.id;
  if (typeof objectId !== "string" || objectId.length === 0) return undefined;
  return { id, type, created, object };
}

function kindOf(eventType: string, object: Record<string, unknown>): ProviderPaymentEventKind {
  if (eventType === "checkout.session.completed" && object.payment_status === "paid") return "succeeded";
  if (eventType === "checkout.session.async_payment_failed") return "failed";
  if (eventType === "payment_intent.payment_failed") return "failed";
  if (eventType === "checkout.session.expired") return "canceled";
  return "unsupported";
}

function paymentIdOf(object: Record<string, unknown>): string | undefined {
  const metadata = object.metadata;
  if (!isRecord(metadata)) return undefined;
  const paymentId = metadata.paymentId;
  return typeof paymentId === "string" && paymentId.length > 0 ? paymentId : undefined;
}

function tenantIdOf(object: Record<string, unknown>): string | undefined {
  const metadata = object.metadata;
  if (!isRecord(metadata)) return undefined;
  const tenantId = metadata.tenantId;
  return typeof tenantId === "string" && tenantId.length > 0 ? tenantId : undefined;
}

function amountOf(object: Record<string, unknown>): Money | undefined {
  const amountMinor = object.amount_total;
  const currency = object.currency;
  if (typeof amountMinor !== "number" || typeof currency !== "string") return undefined;
  const created = Money.create(amountMinor, currency.toUpperCase());
  return isOk(created) ? created.value : undefined;
}

function reasonOf(object: Record<string, unknown>): string | undefined {
  const lastPaymentError = object.last_payment_error;
  if (isRecord(lastPaymentError) && typeof lastPaymentError.code === "string" && lastPaymentError.code.length > 0) {
    return lastPaymentError.code;
  }
  const failureReason = object.failure_reason;
  return typeof failureReason === "string" && failureReason.length > 0 ? failureReason : undefined;
}

function eventOf(event: StripeEventBody): ProviderPaymentEvent {
  const kind = kindOf(event.type, event.object);
  return {
    providerEventId: event.id,
    kind,
    paymentId: paymentIdOf(event.object),
    tenantId: tenantIdOf(event.object),
    providerReference: String(event.object.id),
    amount: kind === "succeeded" ? amountOf(event.object) : undefined,
    occurredAt: new Date(event.created * 1000),
    reason: kind === "failed" ? reasonOf(event.object) : undefined,
  };
}

export class StripePaymentGateway implements PaymentGateway {
  readonly #client: StripeClient;
  readonly #webhookSecret: string;

  constructor(options: StripePaymentGatewayOptions) {
    this.#client = options.client;
    this.#webhookSecret = options.webhookSecret;
  }

  async start(instruction: StartPaymentInstruction): Promise<Result<PaymentHandoff, DomainError>> {
    let response: Response;
    try {
      response = await this.#client.createCheckoutSession(instruction.idempotencyKey, formOf(instruction));
    } catch (thrown: unknown) {
      return err(unavailable(paymentProviderUnavailableCode, messageOf(thrown)));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      return err(translateFailure(response.status, payload));
    }

    const session = checkoutSessionOf(payload);
    if (!session) {
      return err(
        unavailable(
          paymentProviderMalformedResponseCode,
          "Stripe returned a checkout session that could not be parsed",
        ),
      );
    }

    return ok({
      kind: "redirect",
      url: session.url,
      providerReference: session.id,
      expiresAt: new Date(session.expires_at * 1000),
    });
  }

  interpret(notification: ProviderNotification): Promise<Result<ProviderPaymentEvent, DomainError>> {
    const verified = verifyStripeSignature({
      signatureHeader: notification.signature,
      rawBody: notification.rawBody,
      secret: this.#webhookSecret,
      receivedAt: notification.receivedAt,
    });
    if (!verified) {
      return Promise.resolve(
        err(forbidden(paymentNotificationSignatureInvalidCode, "This notification signature is not valid")),
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(notification.rawBody);
    } catch {
      return Promise.resolve(
        err(
          invariantViolation(
            paymentNotificationMalformedCode,
            "This notification body does not match the provider's shape",
          ),
        ),
      );
    }

    const event = stripeEventOf(payload);
    if (!event) {
      return Promise.resolve(
        err(
          invariantViolation(
            paymentNotificationMalformedCode,
            "This notification body does not match the provider's shape",
          ),
        ),
      );
    }

    return Promise.resolve(ok(eventOf(event)));
  }
}
