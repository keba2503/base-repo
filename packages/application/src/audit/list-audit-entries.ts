import { isErr, ok, type DomainError, type Result, type TenantId } from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { Permissions } from "../kernel/ports/permissions";
import { auditResource, readAuditAction, type AuditEntryResponse, type ListAuditEntriesRequest, type ListAuditEntriesResponse } from "./models";
import type { AuditEntry, AuditTrail } from "./ports/audit-trail";

export type ListAuditEntriesDependencies = {
  readonly auditScopedTo: (tenantId: TenantId) => AuditTrail;
  readonly permissions: Permissions;
};

export type ListAuditEntries = (
  request: ListAuditEntriesRequest,
) => Promise<Result<ListAuditEntriesResponse, DomainError>>;

function toResponse(entry: AuditEntry): AuditEntryResponse {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt,
    actorId: entry.actorId,
    actorKind: entry.actorKind,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
  };
}

export function listAuditEntries(dependencies: ListAuditEntriesDependencies): ListAuditEntries {
  const { auditScopedTo, permissions } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: readAuditAction,
      resource: auditResource,
    });
    if (isErr(authorization)) return authorization;

    const entries = await auditScopedTo(request.actor.tenantId).findRecent(request.limit);
    return ok({ entries: entries.map(toResponse) });
  };
}
