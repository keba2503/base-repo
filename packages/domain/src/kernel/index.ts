export { AggregateRoot } from "./aggregate-root";
export { classify, fieldsClassifiedAs, type FieldClassification, type FieldClassifications } from "./classification";
export { conflict, forbidden, invariantViolation, notFound, unavailable, type DomainError, type DomainErrorKind } from "./domain-error";
export type { DomainEvent } from "./domain-event";
export { entityIdOf, isUuid, parseEntityId, parseTenantId, tenantIdOf, type EntityId, type TenantId } from "./identifiers";
export { andThen, err, isErr, isOk, map, ok, type Err, type Ok, type Result } from "./result";
export { isDeleted, type SoftDeletable } from "./soft-deletable";
