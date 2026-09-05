import { afterAll, beforeAll, beforeEach, describe, it } from "bun:test";
import { asc, sql } from "drizzle-orm";
import {
  createPostgresClient,
  outbox,
  outboxRowToEvent,
  PostgresOutbox,
  PostgresTenantRepository,
  PostgresUnitOfWork,
  tenants,
  type PostgresClient,
} from "@base/infrastructure";
import { migrateDatabase } from "../src/postgres/migrate";
import {
  describeOutboxContract,
  describeTenantRepositoryContract,
  describeUnitOfWorkContract,
} from "./contracts/index";

const databaseUrlVariable = "DATABASE_URL";
const databaseUrl = process.env[databaseUrlVariable];
const migrationTimeoutMilliseconds = 60_000;

if (!databaseUrl) {
  console.warn(`Skipping the Postgres contract suites: set ${databaseUrlVariable} to run them`);
  describe.skip("Postgres contract suites", () => {
    it(`run when ${databaseUrlVariable} is set`, () => undefined);
  });
} else {
  describePostgresSuites(databaseUrl);
}

function describePostgresSuites(connectionString: string): void {
  describe("Postgres", () => {
    let client: PostgresClient;

    beforeAll(async () => {
      client = createPostgresClient({ connectionString, maxConnections: 4 });
      await migrateDatabase(client.db);
    }, migrationTimeoutMilliseconds);

    beforeEach(async () => {
      await client.db.execute(sql`truncate table ${outbox}, ${tenants}`);
    });

    afterAll(async () => {
      await client.close();
    });

    describeUnitOfWorkContract("PostgresUnitOfWork", () => new PostgresUnitOfWork(client.db));

    describeOutboxContract("PostgresOutbox", () => ({
      outbox: new PostgresOutbox(client.db),
      enqueued: async () => {
        const rows = await client.db.select().from(outbox).orderBy(asc(outbox.id));
        return rows.map(outboxRowToEvent);
      },
    }));

    describeTenantRepositoryContract("PostgresTenantRepository", () => ({
      registry: new PostgresTenantRepository(client.db, { kind: "registry" }),
      scopedTo: (tenantId) => new PostgresTenantRepository(client.db, { kind: "tenant", tenantId }),
    }));
  });
}
