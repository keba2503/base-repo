import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./tenant-scoped-columns";

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey(),
    ...tenantScopedColumns(),
    subjectId: uuid("subject_id").notNull(),
    category: text("category").notNull(),
    policyVersion: text("policy_version").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true, mode: "date" }),
    sourceIpAddress: text("source_ip_address").notNull(),
    sourceUserAgent: text("source_user_agent").notNull(),
  },
  (table) => [index("consents_tenant_subject_category_idx").on(table.tenantId, table.subjectId, table.category)],
);

export type ConsentRow = typeof consents.$inferSelect;
