import { sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./tenant-scoped-columns";

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey(),
    ...tenantScopedColumns(),
    initiatedBy: uuid("initiated_by").notNull(),
    provider: text("provider").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    providerReference: text("provider_reference"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    failureReason: text("failure_reason"),
  },
  (table) => [
    index("payments_tenant_created_idx").on(table.tenantId, table.createdAt),
    uniqueIndex("payments_provider_reference_idx")
      .on(table.provider, table.providerReference)
      .where(sql`${table.providerReference} is not null`),
  ],
);

export type PaymentRow = typeof payments.$inferSelect;
