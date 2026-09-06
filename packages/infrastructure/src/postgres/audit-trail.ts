import type { ActorKind, AuditEntry, AuditEntryInput, AuditTrail } from "@base/application";
import { and, desc, eq } from "drizzle-orm";
import { isOk, parseEntityId, parseTenantId, type TenantId } from "@base/domain";
import type { PostgresDatabase } from "./client";
import { auditLog, type AuditLogRow } from "./schema/index";
import { runScoped } from "./transaction-context";

function hydrate(row: AuditLogRow): AuditEntry {
  const tenantId = parseTenantId(row.tenantId);
  const actorId = parseEntityId(row.actorId);
  if (!isOk(tenantId) || !isOk(actorId)) {
    throw new Error(`A stored audit entry carries an invalid identifier: ${row.tenantId}/${row.actorId}`);
  }
  return {
    id: String(row.id),
    tenantId: tenantId.value,
    occurredAt: row.occurredAt,
    actorId: actorId.value,
    actorKind: row.actorKind as ActorKind,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
  };
}

export class PostgresAuditTrail implements AuditTrail {
  readonly #db: PostgresDatabase;
  readonly #tenantId: TenantId;

  constructor(db: PostgresDatabase, tenantId: TenantId) {
    this.#db = db;
    this.#tenantId = tenantId;
  }

  async record(entry: AuditEntryInput): Promise<void> {
    if (entry.tenantId !== this.#tenantId) {
      throw new Error("A tenant scoped audit trail may not record outside its own tenant");
    }
    await runScoped(this.#db, { kind: "tenant", tenantId: this.#tenantId }, async (transaction) => {
      await transaction.insert(auditLog).values({
        tenantId: entry.tenantId,
        occurredAt: entry.occurredAt,
        actorId: entry.actorId,
        actorKind: entry.actorKind,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
      });
    });
  }

  findRecent(limit: number): Promise<readonly AuditEntry[]> {
    return runScoped(this.#db, { kind: "tenant", tenantId: this.#tenantId }, async (transaction) => {
      const rows = await transaction
        .select()
        .from(auditLog)
        .where(eq(auditLog.tenantId, this.#tenantId))
        .orderBy(desc(auditLog.occurredAt))
        .limit(limit);
      return rows.map(hydrate);
    });
  }

  findForResource(resourceType: string, resourceId: string): Promise<readonly AuditEntry[]> {
    return runScoped(this.#db, { kind: "tenant", tenantId: this.#tenantId }, async (transaction) => {
      const rows = await transaction
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.resourceType, resourceType), eq(auditLog.resourceId, resourceId)));
      return rows.map(hydrate);
    });
  }
}
