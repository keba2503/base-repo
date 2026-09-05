import { AggregateRoot } from "../kernel/aggregate-root";
import { classify, type FieldClassifications } from "../kernel/classification";
import { invariantViolation, type DomainError } from "../kernel/domain-error";
import type { DomainEvent } from "../kernel/domain-event";
import type { TenantId } from "../kernel/identifiers";
import { err, ok, type Result } from "../kernel/result";

export type TenantSnapshot = {
  readonly id: TenantId;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: Date;
};

export type TenantCreatedPayload = {
  readonly tenantId: string;
  readonly slug: string;
};

export type TenantCreated = DomainEvent<"tenant.created", TenantCreatedPayload>;

export const tenantNameMinimumLength = 2;
export const tenantNameMaximumLength = 80;
export const tenantSlugMinimumLength = 3;
export const tenantSlugMaximumLength = 40;

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const tenantFieldClassifications: FieldClassifications<TenantSnapshot> = classify<TenantSnapshot>({
  id: "none",
  name: "personal",
  slug: "none",
  createdAt: "none",
});

function validateName(name: string): DomainError | undefined {
  if (name.length < tenantNameMinimumLength || name.length > tenantNameMaximumLength) {
    return invariantViolation(
      "tenant.name.length",
      `A tenant name must have between ${String(tenantNameMinimumLength)} and ${String(tenantNameMaximumLength)} characters`,
    );
  }
  return undefined;
}

function validateSlug(slug: string): DomainError | undefined {
  if (slug.length < tenantSlugMinimumLength || slug.length > tenantSlugMaximumLength) {
    return invariantViolation(
      "tenant.slug.length",
      `A tenant slug must have between ${String(tenantSlugMinimumLength)} and ${String(tenantSlugMaximumLength)} characters`,
    );
  }
  if (!slugPattern.test(slug)) {
    return invariantViolation(
      "tenant.slug.format",
      "A tenant slug must be lowercase words separated by single hyphens",
    );
  }
  return undefined;
}

export class Tenant extends AggregateRoot {
  readonly id: TenantId;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: Date;

  private constructor(snapshot: TenantSnapshot) {
    super();
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.slug = snapshot.slug;
    this.createdAt = snapshot.createdAt;
  }

  static create(snapshot: TenantSnapshot): Result<Tenant, DomainError> {
    const restored = Tenant.restore(snapshot);
    if (restored.kind === "err") return restored;
    const tenant = restored.value;
    tenant.record({
      name: "tenant.created",
      tenantId: tenant.id,
      occurredAt: tenant.createdAt,
      payload: { tenantId: tenant.id, slug: tenant.slug },
    });
    return ok(tenant);
  }

  static restore(snapshot: TenantSnapshot): Result<Tenant, DomainError> {
    const name = snapshot.name.trim();
    const invalidName = validateName(name);
    if (invalidName) return err(invalidName);
    const invalidSlug = validateSlug(snapshot.slug);
    if (invalidSlug) return err(invalidSlug);
    return ok(new Tenant({ ...snapshot, name }));
  }

  toSnapshot(): TenantSnapshot {
    return { id: this.id, name: this.name, slug: this.slug, createdAt: this.createdAt };
  }
}
