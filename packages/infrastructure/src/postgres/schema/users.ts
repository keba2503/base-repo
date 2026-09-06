import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./tenant-scoped-columns";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    ...tenantScopedColumns(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export type UserRow = typeof users.$inferSelect;
