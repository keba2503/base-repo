import { AggregateRoot } from "../kernel/aggregate-root";
import { classify, type FieldClassifications } from "../kernel/classification";
import { conflict, invariantViolation, type DomainError } from "../kernel/domain-error";
import type { DomainEvent } from "../kernel/domain-event";
import type { EntityId, TenantId } from "../kernel/identifiers";
import { err, ok, type Result } from "../kernel/result";
import { Money } from "./money";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "canceled";

export type PaymentTransition = "applied" | "alreadyApplied";

export type PaymentSnapshot = {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly initiatedBy: EntityId;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  readonly provider: string;
  readonly status: PaymentStatus;
  readonly providerReference: string | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly failureReason: string | null;
};

export type PaymentStartedPayload = {
  readonly paymentId: string;
  readonly amountMinor: number;
  readonly currency: string;
};

export type PaymentSucceededPayload = {
  readonly paymentId: string;
  readonly providerReference: string;
};

export type PaymentFailedPayload = {
  readonly paymentId: string;
  readonly reason: string;
};

export type PaymentCanceledPayload = {
  readonly paymentId: string;
};

export type PaymentStarted = DomainEvent<"payment.started", PaymentStartedPayload>;
export type PaymentSucceeded = DomainEvent<"payment.succeeded", PaymentSucceededPayload>;
export type PaymentFailed = DomainEvent<"payment.failed", PaymentFailedPayload>;
export type PaymentCanceled = DomainEvent<"payment.canceled", PaymentCanceledPayload>;

export const paymentDescriptionMinimumLength = 1;
export const paymentDescriptionMaximumLength = 140;
export const paymentProviderMaximumLength = 32;

export const paymentFieldClassifications: FieldClassifications<PaymentSnapshot> = classify<PaymentSnapshot>({
  id: "none",
  tenantId: "none",
  initiatedBy: "none",
  amountMinor: "none",
  currency: "none",
  description: "personal",
  provider: "none",
  status: "none",
  providerReference: "personal",
  createdAt: "none",
  resolvedAt: "none",
  failureReason: "none",
});

function validateDescription(description: string): DomainError | undefined {
  if (description.length < paymentDescriptionMinimumLength || description.length > paymentDescriptionMaximumLength) {
    return invariantViolation(
      "payment.description.length",
      `A payment description must have between ${String(paymentDescriptionMinimumLength)} and ${String(paymentDescriptionMaximumLength)} characters`,
    );
  }
  return undefined;
}

function validateProvider(provider: string): DomainError | undefined {
  if (
    provider.length === 0 ||
    provider.length > paymentProviderMaximumLength ||
    provider !== provider.toLowerCase()
  ) {
    return invariantViolation(
      "payment.provider.invalid",
      `A payment provider must be a lowercase, non-empty string of at most ${String(paymentProviderMaximumLength)} characters`,
    );
  }
  return undefined;
}

function validateProviderReference(providerReference: string): DomainError | undefined {
  if (providerReference.trim().length === 0) {
    return invariantViolation(
      "payment.settle.referenceEmpty",
      "A provider reference must not be empty",
    );
  }
  return undefined;
}

export class Payment extends AggregateRoot {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly initiatedBy: EntityId;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  readonly provider: string;
  readonly createdAt: Date;
  #money: Money;
  #status: PaymentStatus;
  #providerReference: string | null;
  #resolvedAt: Date | null;
  #failureReason: string | null;

  private constructor(snapshot: PaymentSnapshot, money: Money) {
    super();
    this.id = snapshot.id;
    this.tenantId = snapshot.tenantId;
    this.initiatedBy = snapshot.initiatedBy;
    this.amountMinor = snapshot.amountMinor;
    this.currency = snapshot.currency;
    this.description = snapshot.description;
    this.provider = snapshot.provider;
    this.createdAt = snapshot.createdAt;
    this.#money = money;
    this.#status = snapshot.status;
    this.#providerReference = snapshot.providerReference;
    this.#resolvedAt = snapshot.resolvedAt;
    this.#failureReason = snapshot.failureReason;
  }

  get status(): PaymentStatus {
    return this.#status;
  }

  get providerReference(): string | null {
    return this.#providerReference;
  }

  get resolvedAt(): Date | null {
    return this.#resolvedAt;
  }

  get failureReason(): string | null {
    return this.#failureReason;
  }

  get money(): Money {
    return this.#money;
  }

  static create(
    snapshot: Omit<PaymentSnapshot, "status" | "providerReference" | "resolvedAt" | "failureReason">,
  ): Result<Payment, DomainError> {
    const restored = Payment.restore({
      ...snapshot,
      status: "pending",
      providerReference: null,
      resolvedAt: null,
      failureReason: null,
    });
    if (restored.kind === "err") return restored;
    const payment = restored.value;
    payment.record({
      name: "payment.started",
      tenantId: payment.tenantId,
      occurredAt: payment.createdAt,
      payload: { paymentId: payment.id, amountMinor: payment.amountMinor, currency: payment.currency },
    });
    return ok(payment);
  }

  static restore(snapshot: PaymentSnapshot): Result<Payment, DomainError> {
    const description = snapshot.description.trim();
    const money = Money.create(snapshot.amountMinor, snapshot.currency);
    const invalid = validateDescription(description) ?? validateProvider(snapshot.provider) ??
      (money.kind === "err" ? money.error : undefined);
    if (invalid) return err(invalid);
    if (money.kind === "err") return err(money.error);
    return ok(new Payment({ ...snapshot, description }, money.value));
  }

  settle(providerReference: string, paidAmount: Money, at: Date): Result<PaymentTransition, DomainError> {
    const invalidReference = validateProviderReference(providerReference);
    if (invalidReference) return err(invalidReference);
    if (!paidAmount.equals(this.#money)) {
      return err(
        conflict(
          "payment.settle.amountMismatch",
          "A payment can only be settled with the amount it was created for",
        ),
      );
    }
    if (this.#status === "succeeded") {
      if (this.#providerReference === providerReference) return ok("alreadyApplied");
      return err(
        conflict(
          "payment.settle.referenceMismatch",
          "A succeeded payment cannot be settled again with a different provider reference",
        ),
      );
    }
    if (this.#status !== "pending") {
      return err(conflict("payment.settle.terminal", `A payment in status ${this.#status} cannot be settled`));
    }
    this.#status = "succeeded";
    this.#providerReference = providerReference;
    this.#resolvedAt = at;
    this.#failureReason = null;
    this.record({
      name: "payment.succeeded",
      tenantId: this.tenantId,
      occurredAt: at,
      payload: { paymentId: this.id, providerReference },
    });
    return ok("applied");
  }

  fail(reason: string, at: Date): Result<PaymentTransition, DomainError> {
    if (this.#status === "failed") {
      if (this.#failureReason === reason) return ok("alreadyApplied");
      return err(
        conflict("payment.fail.reasonMismatch", "A failed payment cannot be failed again with a different reason"),
      );
    }
    if (this.#status !== "pending") {
      return err(conflict("payment.fail.terminal", `A payment in status ${this.#status} cannot be failed`));
    }
    this.#status = "failed";
    this.#failureReason = reason;
    this.#resolvedAt = at;
    this.record({
      name: "payment.failed",
      tenantId: this.tenantId,
      occurredAt: at,
      payload: { paymentId: this.id, reason },
    });
    return ok("applied");
  }

  cancel(at: Date): Result<PaymentTransition, DomainError> {
    if (this.#status === "canceled") return ok("alreadyApplied");
    if (this.#status !== "pending") {
      return err(conflict("payment.cancel.terminal", `A payment in status ${this.#status} cannot be canceled`));
    }
    this.#status = "canceled";
    this.#resolvedAt = at;
    this.#failureReason = null;
    this.record({
      name: "payment.canceled",
      tenantId: this.tenantId,
      occurredAt: at,
      payload: { paymentId: this.id },
    });
    return ok("applied");
  }

  toSnapshot(): PaymentSnapshot {
    return {
      id: this.id,
      tenantId: this.tenantId,
      initiatedBy: this.initiatedBy,
      amountMinor: this.amountMinor,
      currency: this.currency,
      description: this.description,
      provider: this.provider,
      status: this.#status,
      providerReference: this.#providerReference,
      createdAt: this.createdAt,
      resolvedAt: this.#resolvedAt,
      failureReason: this.#failureReason,
    };
  }
}
