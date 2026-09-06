import { AggregateRoot } from "../kernel/aggregate-root";
import { classify, type FieldClassifications } from "../kernel/classification";
import { conflict, invariantViolation, type DomainError } from "../kernel/domain-error";
import type { DomainEvent } from "../kernel/domain-event";
import type { EntityId, TenantId } from "../kernel/identifiers";
import { err, ok, type Result } from "../kernel/result";

export const consentCategories = ["functional", "analytics", "marketing"] as const;

export type ConsentCategory = (typeof consentCategories)[number];

export function isConsentCategory(value: string): value is ConsentCategory {
  return consentCategories.some((candidate) => candidate === value);
}

export type ConsentSnapshot = {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly subjectId: EntityId;
  readonly category: ConsentCategory;
  readonly policyVersion: string;
  readonly grantedAt: Date;
  readonly withdrawnAt: Date | null;
  readonly sourceIpAddress: string;
  readonly sourceUserAgent: string;
};

export type ConsentGrantedPayload = {
  readonly consentId: string;
  readonly subjectId: string;
  readonly category: ConsentCategory;
  readonly policyVersion: string;
};

export type ConsentWithdrawnPayload = {
  readonly consentId: string;
  readonly subjectId: string;
  readonly category: ConsentCategory;
};

export type ConsentGranted = DomainEvent<"consent.granted", ConsentGrantedPayload>;
export type ConsentWithdrawn = DomainEvent<"consent.withdrawn", ConsentWithdrawnPayload>;

export const consentPolicyVersionMinimumLength = 1;

export const consentFieldClassifications: FieldClassifications<ConsentSnapshot> = classify<ConsentSnapshot>({
  id: "none",
  tenantId: "none",
  subjectId: "personal",
  category: "none",
  policyVersion: "none",
  grantedAt: "none",
  withdrawnAt: "none",
  sourceIpAddress: "personal",
  sourceUserAgent: "personal",
});

function validatePolicyVersion(policyVersion: string): DomainError | undefined {
  if (policyVersion.length < consentPolicyVersionMinimumLength) {
    return invariantViolation("consent.policyVersion.empty", "A consent must reference a non empty policy version");
  }
  return undefined;
}

function validateSource(sourceIpAddress: string, sourceUserAgent: string): DomainError | undefined {
  if (sourceIpAddress.length === 0) {
    return invariantViolation("consent.source.ipAddress.empty", "A consent must record the address it was captured from");
  }
  if (sourceUserAgent.length === 0) {
    return invariantViolation("consent.source.userAgent.empty", "A consent must record the user agent it was captured from");
  }
  return undefined;
}

export class Consent extends AggregateRoot {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly subjectId: EntityId;
  readonly category: ConsentCategory;
  readonly policyVersion: string;
  readonly grantedAt: Date;
  readonly sourceIpAddress: string;
  readonly sourceUserAgent: string;
  #withdrawnAt: Date | null;

  private constructor(snapshot: ConsentSnapshot) {
    super();
    this.id = snapshot.id;
    this.tenantId = snapshot.tenantId;
    this.subjectId = snapshot.subjectId;
    this.category = snapshot.category;
    this.policyVersion = snapshot.policyVersion;
    this.grantedAt = snapshot.grantedAt;
    this.sourceIpAddress = snapshot.sourceIpAddress;
    this.sourceUserAgent = snapshot.sourceUserAgent;
    this.#withdrawnAt = snapshot.withdrawnAt;
  }

  get withdrawnAt(): Date | null {
    return this.#withdrawnAt;
  }

  get isActive(): boolean {
    return this.#withdrawnAt === null;
  }

  covers(policyVersion: string): boolean {
    return this.isActive && this.policyVersion === policyVersion;
  }

  static grant(snapshot: Omit<ConsentSnapshot, "withdrawnAt">): Result<Consent, DomainError> {
    const restored = Consent.restore({ ...snapshot, withdrawnAt: null });
    if (restored.kind === "err") return restored;
    const consent = restored.value;
    consent.record({
      name: "consent.granted",
      tenantId: consent.tenantId,
      occurredAt: consent.grantedAt,
      payload: {
        consentId: consent.id,
        subjectId: consent.subjectId,
        category: consent.category,
        policyVersion: consent.policyVersion,
      },
    });
    return ok(consent);
  }

  static restore(snapshot: ConsentSnapshot): Result<Consent, DomainError> {
    const invalid = validatePolicyVersion(snapshot.policyVersion) ?? validateSource(snapshot.sourceIpAddress, snapshot.sourceUserAgent);
    if (invalid) return err(invalid);
    return ok(new Consent(snapshot));
  }

  withdraw(at: Date): Result<void, DomainError> {
    if (!this.isActive) {
      return err(conflict("consent.alreadyWithdrawn", "This consent was already withdrawn"));
    }
    this.#withdrawnAt = at;
    this.record({
      name: "consent.withdrawn",
      tenantId: this.tenantId,
      occurredAt: at,
      payload: { consentId: this.id, subjectId: this.subjectId, category: this.category },
    });
    return ok(undefined);
  }

  toSnapshot(): ConsentSnapshot {
    return {
      id: this.id,
      tenantId: this.tenantId,
      subjectId: this.subjectId,
      category: this.category,
      policyVersion: this.policyVersion,
      grantedAt: this.grantedAt,
      withdrawnAt: this.#withdrawnAt,
      sourceIpAddress: this.sourceIpAddress,
      sourceUserAgent: this.sourceUserAgent,
    };
  }
}
