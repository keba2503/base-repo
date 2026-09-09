import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  paymentInstructionInvalidCode,
  paymentNotificationMalformedCode,
  paymentNotificationSignatureInvalidCode,
  paymentProviderUnavailableCode,
  type Clock,
  type PaymentGateway,
  type PaymentHandoff,
  type ProviderNotification,
  type ProviderPaymentEvent,
  type ProviderPaymentEventKind,
  type StartPaymentInstruction,
} from "@base/application";
import {
  err,
  forbidden,
  invariantViolation,
  isOk,
  Money,
  ok,
  unavailable,
  type DomainError,
  type EntityId,
  type Result,
} from "@base/domain";


export const paymentHandoffLifetimeMilliseconds = 24 * 60 * 60 * 1000;
export const paymentNotificationToleranceMilliseconds = 5 * 60 * 1000;
export const paymentWebhookSecretMinimumLength = 16;

const succeededEventType = "payment.succeeded";
const failedEventType = "payment.failed";
const canceledEventType = "payment.canceled";
const unsupportedEventType = "payment.refunded";

export type PaymentNotificationFixture = {
  readonly paymentId: EntityId;
  readonly tenantId?: string;
  readonly providerReference: string;
  readonly amount?: Money;
  readonly reason?: string;
  readonly occurredAt?: Date;
};

export type InMemoryPaymentGatewayOptions = {
  readonly clock: Clock;
  readonly webhookSecret: string;
  readonly baseUrl: string;
};

type ProviderEventBody = {
  readonly id: string;
  readonly type: string;
  readonly created: number;
  readonly data: {
    readonly paymentId: string | undefined;
    readonly tenantId: string | undefined;
    readonly providerReference: string;
    readonly amountMinor: number | undefined;
    readonly currency: string | undefined;
    readonly reason: string | undefined;
  };
};

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isAbsoluteHttpsUrl(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && loopbackHosts.has(url.hostname);
}

function validateInstruction(instruction: StartPaymentInstruction): DomainError | undefined {
  if (instruction.idempotencyKey.trim().length === 0) {
    return invariantViolation(paymentInstructionInvalidCode, "A payment instruction must carry an idempotency key");
  }
  if (!isAbsoluteHttpsUrl(instruction.returnUrl) || !isAbsoluteHttpsUrl(instruction.cancelUrl)) {
    return invariantViolation(
      paymentInstructionInvalidCode,
      "A payment instruction must carry absolute https return and cancel urls",
    );
  }
  return undefined;
}

function computeSignature(secret: string, timestampSeconds: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${String(timestampSeconds)}.${rawBody}`).digest("hex");
}

function tamper(hex: string): string {
  const lastCharacter = hex.slice(-1);
  return `${hex.slice(0, -1)}${lastCharacter === "0" ? "1" : "0"}`;
}

function fingerprint(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function signaturesMatch(expectedHex: string, candidateHex: string): boolean {
  return timingSafeEqual(fingerprint(expectedHex), fingerprint(candidateHex));
}

function parseSignatureHeader(signature: string): { readonly timestampSeconds: number; readonly v1: string } | undefined {
  let timestampSeconds: number | undefined;
  let v1: string | undefined;
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=");
    if (key === "t" && value !== undefined) timestampSeconds = Number(value);
    if (key === "v1" && value !== undefined) v1 = value;
  }
  if (timestampSeconds === undefined || !Number.isFinite(timestampSeconds) || v1 === undefined) return undefined;
  return { timestampSeconds, v1 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEventBody(rawBody: string): ProviderEventBody | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const { id, type, created, data } = parsed;
  if (typeof id !== "string" || id.length === 0) return undefined;
  if (typeof type !== "string" || type.length === 0) return undefined;
  if (typeof created !== "number" || !Number.isFinite(created)) return undefined;
  if (!isRecord(data)) return undefined;
  const providerReference = data.providerReference;
  if (typeof providerReference !== "string" || providerReference.length === 0) return undefined;
  return {
    id,
    type,
    created,
    data: {
      paymentId: typeof data.paymentId === "string" ? data.paymentId : undefined,
      tenantId: typeof data.tenantId === "string" ? data.tenantId : undefined,
      providerReference,
      amountMinor: typeof data.amountMinor === "number" ? data.amountMinor : undefined,
      currency: typeof data.currency === "string" ? data.currency : undefined,
      reason: typeof data.reason === "string" ? data.reason : undefined,
    },
  };
}

function eventKindOf(type: string): ProviderPaymentEventKind {
  if (type === succeededEventType) return "succeeded";
  if (type === failedEventType) return "failed";
  if (type === canceledEventType) return "canceled";
  return "unsupported";
}

function eventTypeFor(kind: "succeeded" | "failed" | "canceled"): string {
  if (kind === "succeeded") return succeededEventType;
  if (kind === "failed") return failedEventType;
  return canceledEventType;
}

function bodyFor(fixture: PaymentNotificationFixture, eventId: string, createdSeconds: number, type: string): string {
  return JSON.stringify({
    id: eventId,
    type,
    created: createdSeconds,
    data: {
      paymentId: fixture.paymentId,
      tenantId: fixture.tenantId,
      providerReference: fixture.providerReference,
      amountMinor: fixture.amount?.amountMinor,
      currency: fixture.amount?.currency,
      reason: fixture.reason,
    },
  });
}

export class InMemoryPaymentGateway implements PaymentGateway {
  readonly #clock: Clock;
  readonly #webhookSecret: string;
  readonly #baseUrl: string;
  readonly #sessions = new Map<string, PaymentHandoff>();
  #outage = false;
  #eventSequence = 0;

  constructor(options: InMemoryPaymentGatewayOptions) {
    if (options.webhookSecret.length < paymentWebhookSecretMinimumLength) {
      throw new Error(
        `The payment gateway webhook secret must have at least ${String(paymentWebhookSecretMinimumLength)} characters`,
      );
    }
    if (!isAbsoluteHttpsUrl(options.baseUrl)) {
      throw new Error("The payment gateway base url must be an absolute https url");
    }
    this.#clock = options.clock;
    this.#webhookSecret = options.webhookSecret;
    this.#baseUrl = options.baseUrl;
  }

  simulateOutage(active: boolean): void {
    this.#outage = active;
  }

  start(instruction: StartPaymentInstruction): Promise<Result<PaymentHandoff, DomainError>> {
    if (this.#outage) {
      return Promise.resolve(
        err(unavailable(paymentProviderUnavailableCode, "The payment provider is unavailable")),
      );
    }
    const invalid = validateInstruction(instruction);
    if (invalid) return Promise.resolve(err(invalid));

    const existing = this.#sessions.get(instruction.idempotencyKey);
    if (existing) return Promise.resolve(ok(existing));

    const providerReference = `pi_${randomUUID().replace(/-/g, "")}`;
    const issuedAt = this.#clock.now();
    const handoff: PaymentHandoff = {
      kind: "redirect",
      url: `${this.#baseUrl}/checkout/${providerReference}`,
      providerReference,
      expiresAt: new Date(issuedAt.getTime() + paymentHandoffLifetimeMilliseconds),
    };
    this.#sessions.set(instruction.idempotencyKey, handoff);
    return Promise.resolve(ok(handoff));
  }

  interpret(notification: ProviderNotification): Promise<Result<ProviderPaymentEvent, DomainError>> {
    if (this.#outage) {
      return Promise.resolve(
        err(unavailable(paymentProviderUnavailableCode, "The payment provider is unavailable")),
      );
    }

    const parsedSignature = parseSignatureHeader(notification.signature);
    if (!parsedSignature) {
      return Promise.resolve(
        err(forbidden(paymentNotificationSignatureInvalidCode, "This notification signature is not well formed")),
      );
    }

    const expected = computeSignature(this.#webhookSecret, parsedSignature.timestampSeconds, notification.rawBody);
    if (!signaturesMatch(expected, parsedSignature.v1)) {
      return Promise.resolve(
        err(forbidden(paymentNotificationSignatureInvalidCode, "This notification signature does not match its body")),
      );
    }

    const ageMilliseconds = notification.receivedAt.getTime() - parsedSignature.timestampSeconds * 1000;
    if (Math.abs(ageMilliseconds) > paymentNotificationToleranceMilliseconds) {
      return Promise.resolve(
        err(forbidden(paymentNotificationSignatureInvalidCode, "This notification signature is stale")),
      );
    }

    const body = parseEventBody(notification.rawBody);
    if (!body) {
      return Promise.resolve(
        err(invariantViolation(paymentNotificationMalformedCode, "This notification body does not match the provider's shape")),
      );
    }

    const kind = eventKindOf(body.type);
    const money =
      body.data.amountMinor !== undefined && body.data.currency !== undefined
        ? Money.create(body.data.amountMinor, body.data.currency)
        : undefined;

    return Promise.resolve(
      ok({
        providerEventId: body.id,
        kind,
        paymentId: body.data.paymentId,
        tenantId: body.data.tenantId,
        providerReference: body.data.providerReference,
        amount: money && isOk(money) ? money.value : undefined,
        occurredAt: new Date(body.created * 1000),
        reason: body.data.reason,
      }),
    );
  }

  #nextEventId(): string {
    this.#eventSequence += 1;
    return `evt_${String(this.#eventSequence)}_${randomUUID().replace(/-/g, "")}`;
  }

  buildNotification(kind: "succeeded" | "failed" | "canceled", fixture: PaymentNotificationFixture): ProviderNotification {
    const now = this.#clock.now();
    const timestampSeconds = Math.floor(now.getTime() / 1000);
    const createdSeconds = Math.floor((fixture.occurredAt ?? now).getTime() / 1000);
    const rawBody = bodyFor(fixture, this.#nextEventId(), createdSeconds, eventTypeFor(kind));
    return {
      rawBody,
      signature: `t=${String(timestampSeconds)},v1=${computeSignature(this.#webhookSecret, timestampSeconds, rawBody)}`,
      receivedAt: now,
    };
  }

  buildTamperedNotification(
    kind: "succeeded" | "failed" | "canceled",
    fixture: PaymentNotificationFixture,
  ): ProviderNotification {
    const notification = this.buildNotification(kind, fixture);
    const [tPart, v1Part] = notification.signature.split(",");
    return { ...notification, signature: `${String(tPart)},${tamper(String(v1Part))}` };
  }

  buildStaleNotification(
    kind: "succeeded" | "failed" | "canceled",
    fixture: PaymentNotificationFixture,
  ): ProviderNotification {
    const now = this.#clock.now();
    const staleTimestampSeconds =
      Math.floor(now.getTime() / 1000) - Math.floor(paymentNotificationToleranceMilliseconds / 1000) - 60;
    const rawBody = bodyFor(fixture, this.#nextEventId(), staleTimestampSeconds, eventTypeFor(kind));
    return {
      rawBody,
      signature: `t=${String(staleTimestampSeconds)},v1=${computeSignature(this.#webhookSecret, staleTimestampSeconds, rawBody)}`,
      receivedAt: now,
    };
  }

  buildUnsupportedNotification(fixture: PaymentNotificationFixture): ProviderNotification {
    const now = this.#clock.now();
    const timestampSeconds = Math.floor(now.getTime() / 1000);
    const rawBody = bodyFor(fixture, this.#nextEventId(), timestampSeconds, unsupportedEventType);
    return {
      rawBody,
      signature: `t=${String(timestampSeconds)},v1=${computeSignature(this.#webhookSecret, timestampSeconds, rawBody)}`,
      receivedAt: now,
    };
  }

  buildMalformedNotification(): ProviderNotification {
    const now = this.#clock.now();
    const timestampSeconds = Math.floor(now.getTime() / 1000);
    const rawBody = "not-a-payment-event";
    return {
      rawBody,
      signature: `t=${String(timestampSeconds)},v1=${computeSignature(this.#webhookSecret, timestampSeconds, rawBody)}`,
      receivedAt: now,
    };
  }
}
