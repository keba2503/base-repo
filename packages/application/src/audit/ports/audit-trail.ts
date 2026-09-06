import type { EntityId, TenantId } from "@base/domain";
import type { ActorKind } from "../../kernel/actor";

export type AuditEntry = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly occurredAt: Date;
  readonly actorId: EntityId;
  readonly actorKind: ActorKind;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
};

export type AuditEntryInput = Omit<AuditEntry, "id">;

export type AuditTrail = {
  record(entry: AuditEntryInput): Promise<void>;
  findRecent(limit: number): Promise<readonly AuditEntry[]>;
  findForResource(resourceType: string, resourceId: string): Promise<readonly AuditEntry[]>;
};
