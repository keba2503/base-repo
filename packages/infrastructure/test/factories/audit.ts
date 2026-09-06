import type { AuditEntryInput } from "@base/application";
import { entityIdFactory } from "./identity";
import { tenantIdFactory } from "./tenant";

export function auditEntryInputFactory(overrides: Partial<AuditEntryInput> = {}): AuditEntryInput {
  return {
    tenantId: tenantIdFactory(1),
    occurredAt: new Date("2026-01-15T10:00:00.000Z"),
    actorId: entityIdFactory(20),
    actorKind: "user",
    action: "consent:grant",
    resourceType: "consent",
    resourceId: entityIdFactory(40),
    ...overrides,
  };
}
