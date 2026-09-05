import type { DomainEvent } from "@base/domain";
import { tenantIdFactory } from "./actor";

export function eventFactory(overrides: Partial<DomainEvent> = {}): DomainEvent {
  const tenantId = overrides.tenantId ?? tenantIdFactory(1);
  return {
    name: "tenant.created",
    tenantId,
    occurredAt: new Date("2026-01-15T10:00:00.000Z"),
    payload: { tenantId, slug: "acme-clinic" },
    ...overrides,
  };
}
