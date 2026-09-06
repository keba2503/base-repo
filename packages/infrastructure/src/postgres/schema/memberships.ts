import { bigserial, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./tenant-scoped-columns";

export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id").notNull(),
    ...tenantScopedColumns(),
    role: text("role").notNull(),
    grantedSequence: bigserial("granted_sequence", { mode: "bigint" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tenantId] })],
);

export type MembershipRow = typeof memberships.$inferSelect;
