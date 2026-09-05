import { timestamp, uuid } from "drizzle-orm/pg-core";

function tenantIdColumn() {
  return uuid("tenant_id").notNull();
}

function createdAtColumn() {
  return timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
}

export type TenantScopedColumns = {
  readonly tenantId: ReturnType<typeof tenantIdColumn>;
  readonly createdAt: ReturnType<typeof createdAtColumn>;
};

export function tenantScopedColumns(): TenantScopedColumns {
  return { tenantId: tenantIdColumn(), createdAt: createdAtColumn() };
}
