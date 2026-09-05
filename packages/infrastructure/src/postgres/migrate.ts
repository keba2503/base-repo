import { resolve } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { PostgresDatabase } from "./client";

export const migrationsFolder = resolve(import.meta.dirname, "../../migrations");

export async function migrateDatabase(db: PostgresDatabase): Promise<void> {
  await migrate(db, { migrationsFolder });
}
