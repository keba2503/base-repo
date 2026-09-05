import { createPostgresClient } from "../../packages/infrastructure/src/postgres/client";
import { migrateDatabase, migrationsFolder } from "../../packages/infrastructure/src/postgres/migrate";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required to run migrations");
  process.exit(1);
}

const client = createPostgresClient({ connectionString, maxConnections: 1 });
try {
  await migrateDatabase(client.db);
  console.info(`migrations applied from ${migrationsFolder}`);
} finally {
  await client.close();
}
