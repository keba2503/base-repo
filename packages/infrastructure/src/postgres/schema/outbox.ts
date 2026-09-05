import { sql } from "drizzle-orm";
import { bigserial, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./tenant-scoped-columns";

export const outbox = pgTable(
  "outbox",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ...tenantScopedColumns(),
    name: text("name").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("outbox_unpublished_idx").on(table.id).where(sql`${table.publishedAt} is null`)],
);

export type OutboxRow = typeof outbox.$inferSelect;
