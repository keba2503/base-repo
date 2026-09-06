import { bigserial, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./tenant-scoped-columns";

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ...tenantScopedColumns(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    actorId: uuid("actor_id").notNull(),
    actorKind: text("actor_kind").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
  },
  (table) => [
    index("audit_log_tenant_occurred_idx").on(table.tenantId, table.occurredAt),
    index("audit_log_tenant_resource_idx").on(table.tenantId, table.resourceType, table.resourceId),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
