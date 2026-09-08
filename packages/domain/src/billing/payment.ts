import { AggregateRoot } from "../kernel/aggregate-root";
import { classify, type FieldClassifications } from "../kernel/classification";
import { conflict, invariantViolation, type DomainError } from "../kernel/domain-error";
import type { DomainEvent } from "../kernel/domain-event";
import type { EntityId, TenantId } from "../kernel/identifiers";
import { err, ok, type Result } from "../kernel/result";
import { Money, moneyOf, type Currency } from "./money";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "canceled";

export type PaymentSnapshot = {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  readonly status: PaymentStatus;
  readonly providerReference: string | null;
  readonly createdAt: Date;
  readonly settledAt: Date | null;
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

export const paymentFieldClassifications: FieldClassifications<PaymentSnapshot> = classify<PaymentSnapshot>({
  id: "none",
  tenantId: "none",
  amountMinor: "none",
  currency: "none",
  description: "personal",
  status: "none",
  providerReference: "none",
  createdAt: "none",
  settledAt: "none",
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

export class Payment extends AggregateRoot {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  readonly createdAt: Date;
  #status: PaymentStatus;
  #providerReference: string | null;
  #settledAt: Date | null;
  #failureReason: string | null;

  private constructor(snapshot: PaymentSnapshot) {
    super();
    this.id = snapshot.id;
    this.tenantId = snapshot.tenantId;
    this.amountMinor = snapshot.amountMinor;
    this.currency = snapshot.currency;
    this.description = snapshot.description;
    this.createdAt = snapshot.createdAt;
    this.#status = snapshot.status;
    this.#providerReference = snapshot.providerReference;
    this.#settledAt = snapshot.settledAt;
    this.#failureReason = snapshot.failureReason;
  }

  get status(): PaymentStatus {
    return this.#status;
  }

  get providerReference(): string | null {
    return this.#providerReference;
  }

  get settledAt(): Date | null {
    return this.#settledAt;
  }

  get failureReason(): string | null {
    return this.#failureReason;
  }

  get money(): Money {
    return moneyOf(this.amountMinor, this.currency as Currency);
  }

  static create(
    snapshot: Omit<PaymentSnapshot, "status" | "providerReference" | "settledAt" | "failureReason">,
  ): Result<Payment, DomainError> {
    const restored = Payment.restore({
      ...snapshot,
      status: "pending",
      providerReference: null,
      settledAt: null,
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
    const invalid = validateDescription(description) ?? (money.kind === "err" ? money.error : undefined);
    if (invalid) return err(invalid);
    return ok(new Payment({ ...snapshot, description }));
  }

  settle(providerReference: string, at: Date): Result<void, DomainError> {
    if (this.#status === "succeeded") {
      if (this.#providerReference === providerReference) return ok(undefined);
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
    this.#settledAt = at;
    this.#failureReason = null;
    this.record({
      name: "payment.succeeded",
      tenantId: this.tenantId,
      occurredAt: at,
      payload: { paymentId: this.id, providerReference },
    });
    return ok(undefined);
  }

  fail(reason: string, at: Date): Result<void, DomainError> {
    if (this.#status === "failed") {
      if (this.#failureReason === reason) return ok(undefined);
      return err(
        conflict("payment.fail.reasonMismatch", "A failed payment cannot be failed again with a different reason"),
      );
    }
    if (this.#status !== "pending") {
      return err(conflict("payment.fail.terminal", `A payment in status ${this.#status} cannot be failed`));
    }
    this.#status = "failed";
    this.#failureReason = reason;
    this.#settledAt = at;
    this.record({
      name: "payment.failed",
      tenantId: this.tenantId,
      occurredAt: at,
      payload: { paymentId: this.id, reason },
    });
    return ok(undefined);
  }

  cancel(at: Date): Result<void, DomainError> {
    if (this.#status === "canceled") return ok(undefined);
    if (this.#status !== "pending") {
      return err(conflict("payment.cancel.terminal", `A payment in status ${this.#status} cannot be canceled`));
    }
    this.#status = "canceled";
    this.#settledAt = at;
    this.#failureReason = null;
    this.record({
      name: "payment.canceled",
      tenantId: this.tenantId,
      occurredAt: at,
      payload: { paymentId: this.id },
    });
    return ok(undefined);
  }

  toSnapshot(): PaymentSnapshot {
    return {
      id: this.id,
      tenantId: this.tenantId,
      amountMinor: this.amountMinor,
      currency: this.currency,
      description: this.description,
      status: this.#status,
      providerReference: this.#providerReference,
      createdAt: this.createdAt,
      settledAt: this.#settledAt,
      failureReason: this.#failureReason,
    };
  }
}
