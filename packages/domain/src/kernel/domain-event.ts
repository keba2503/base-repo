import type { TenantId } from "./identifiers";

export type DomainEvent<Name extends string = string, Payload = unknown> = {
  readonly name: Name;
  readonly tenantId: TenantId;
  readonly occurredAt: Date;
  readonly payload: Payload;
};
