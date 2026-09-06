import type { Actor, ActorKind } from "../kernel/actor";

export const auditResource = "audit";
export const readAuditAction = "audit:read";

export type ListAuditEntriesRequest = {
  readonly actor: Actor;
  readonly limit: number;
};

export type AuditEntryResponse = {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly actorKind: ActorKind;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
};

export type ListAuditEntriesResponse = {
  readonly entries: readonly AuditEntryResponse[];
};
