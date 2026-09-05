import { invariantViolation, type DomainError } from "./domain-error";
import { err, ok, type Result } from "./result";

declare const brand: unique symbol;

type Branded<Carrier, Name extends string> = Carrier & { readonly [brand]: Name };

export type EntityId = Branded<string, "EntityId">;

export type TenantId = Branded<string, "TenantId">;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value.toLowerCase());
}

function brandUuid<Id extends string>(value: string, code: string): Result<Id, DomainError> {
  const normalised = value.toLowerCase();
  if (!isUuid(normalised)) {
    return err(invariantViolation(code, "An identifier must be a lowercase UUID"));
  }
  return ok(normalised as Id);
}

export function parseEntityId(value: string): Result<EntityId, DomainError> {
  return brandUuid<EntityId>(value, "identifier.entityId.invalid");
}

export function parseTenantId(value: string): Result<TenantId, DomainError> {
  return brandUuid<TenantId>(value, "identifier.tenantId.invalid");
}

export function tenantIdOf(id: EntityId): TenantId {
  return id as string as TenantId;
}

export function entityIdOf(id: TenantId): EntityId {
  return id as string as EntityId;
}
