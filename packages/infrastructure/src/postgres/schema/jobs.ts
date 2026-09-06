import { sql } from "drizzle-orm";
import { bigserial, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./tenant-scoped-columns";

export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ...tenantScopedColumns(),
    name: text("name").notNull(),
    payload: jsonb("payload").notNull(),
    runAt: timestamp("run_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    exhaustedAt: timestamp("exhausted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("jobs_due_idx")
      .on(table.runAt, table.id)
      .where(sql`${table.completedAt} is null and ${table.exhaustedAt} is null`),
  ],
);

export type JobRow = typeof jobs.$inferSelect;
