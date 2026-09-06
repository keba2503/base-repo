import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./tenant-scoped-columns";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),
    ...tenantScopedColumns(),
    uploadedBy: uuid("uploaded_by").notNull(),
    originalFilename: text("original_filename").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: text("status").notNull(),
    extractedText: text("extracted_text"),
    failureReason: text("failure_reason"),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("documents_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export type DocumentRow = typeof documents.$inferSelect;
