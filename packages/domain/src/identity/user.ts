import { AggregateRoot } from "../kernel/aggregate-root";
import { classify, type FieldClassifications } from "../kernel/classification";
import { invariantViolation, type DomainError } from "../kernel/domain-error";
import type { DomainEvent } from "../kernel/domain-event";
import type { EntityId, TenantId } from "../kernel/identifiers";
import { err, ok, type Result } from "../kernel/result";
import { parseEmail, type Email } from "./email";

export type UserSnapshot = {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly email: Email;
  readonly displayName: string;
  readonly createdAt: Date;
};

export type UserRegisteredPayload = {
  readonly userId: string;
  readonly tenantId: string;
};

export type UserRegistered = DomainEvent<"user.registered", UserRegisteredPayload>;

export type UserAnonymizedPayload = {
  readonly userId: string;
  readonly tenantId: string;
};

export type UserAnonymized = DomainEvent<"user.anonymized", UserAnonymizedPayload>;

export const userDisplayNameMinimumLength = 1;
export const userDisplayNameMaximumLength = 80;

export const userFieldClassifications: FieldClassifications<UserSnapshot> = classify<UserSnapshot>({
  id: "none",
  tenantId: "none",
  email: "personal",
  displayName: "personal",
  createdAt: "none",
});

function validateDisplayName(displayName: string): DomainError | undefined {
  if (
    displayName.length < userDisplayNameMinimumLength ||
    displayName.length > userDisplayNameMaximumLength
  ) {
    return invariantViolation(
      "user.displayName.length",
      `A display name must have between ${String(userDisplayNameMinimumLength)} and ${String(userDisplayNameMaximumLength)} characters`,
    );
  }
  return undefined;
}

export class User extends AggregateRoot {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly createdAt: Date;
  #email: Email;
  #displayName: string;

  private constructor(snapshot: UserSnapshot) {
    super();
    this.id = snapshot.id;
    this.tenantId = snapshot.tenantId;
    this.createdAt = snapshot.createdAt;
    this.#email = snapshot.email;
    this.#displayName = snapshot.displayName;
  }

  get email(): Email {
    return this.#email;
  }

  get displayName(): string {
    return this.#displayName;
  }

  static register(snapshot: UserSnapshot): Result<User, DomainError> {
    const restored = User.restore(snapshot);
    if (restored.kind === "err") return restored;
    const user = restored.value;
    user.record({
      name: "user.registered",
      tenantId: user.tenantId,
      occurredAt: user.createdAt,
      payload: { userId: user.id, tenantId: user.tenantId },
    });
    return ok(user);
  }

  static restore(snapshot: UserSnapshot): Result<User, DomainError> {
    const displayName = snapshot.displayName.trim();
    const invalidDisplayName = validateDisplayName(displayName);
    if (invalidDisplayName) return err(invalidDisplayName);
    return ok(new User({ ...snapshot, displayName }));
  }

  anonymize(input: { readonly at: Date; readonly token: string }): Result<void, DomainError> {
    const anonymizedEmail = parseEmail(`${input.token}@erased.invalid`);
    if (anonymizedEmail.kind === "err") return anonymizedEmail;
    this.#email = anonymizedEmail.value;
    this.#displayName = input.token;
    this.record({
      name: "user.anonymized",
      tenantId: this.tenantId,
      occurredAt: input.at,
      payload: { userId: this.id, tenantId: this.tenantId },
    });
    return ok(undefined);
  }

  toSnapshot(): UserSnapshot {
    return {
      id: this.id,
      tenantId: this.tenantId,
      email: this.#email,
      displayName: this.#displayName,
      createdAt: this.createdAt,
    };
  }
}
