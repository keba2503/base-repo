import { sql } from "drizzle-orm";
import { bigserial, index, integer, jsonb, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./tenant-scoped-columns";

export const interactiveJobPriority = 0;
export const backgroundJobPriority = 1;

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
    priority: smallint("priority").notNull().default(backgroundJobPriority),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    exhaustedAt: timestamp("exhausted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("jobs_dispatch_idx")
      .on(table.tenantId, table.priority, table.runAt, table.id)
      .where(sql`${table.completedAt} is null and ${table.exhaustedAt} is null`),
  ],
);

export type JobRow = typeof jobs.$inferSelect;
