import { afterAll, beforeAll, beforeEach, describe, it } from "bun:test";
import { asc, sql } from "drizzle-orm";
import {
  apiKeys,
  createPostgresClient,
  memberships,
  outbox,
  outboxRowToEvent,
  PostgresApiKeyRepository,
  PostgresMembershipRepository,
  PostgresOutbox,
  PostgresTenantRepository,
  PostgresUnitOfWork,
  PostgresUserRepository,
  tenants,
  users,
  type PostgresClient,
} from "@base/infrastructure";
import { migrateDatabase } from "../src/postgres/migrate";
import {
  describeApiKeyRepositoryContract,
  describeMembershipRepositoryContract,
  describeOutboxContract,
  describeTenantRepositoryContract,
  describeUnitOfWorkContract,
  describeUserRepositoryContract,
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
      await client.db.execute(
        sql`truncate table ${outbox}, ${tenants}, ${users}, ${memberships}, ${apiKeys}`,
      );
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

    describeUserRepositoryContract("PostgresUserRepository", () => ({
      registry: new PostgresUserRepository(client.db, { kind: "registry" }),
      scopedTo: (tenantId) => new PostgresUserRepository(client.db, { kind: "tenant", tenantId }),
    }));

    describeMembershipRepositoryContract("PostgresMembershipRepository", () => ({
      registry: new PostgresMembershipRepository(client.db, { kind: "registry" }),
      scopedTo: (tenantId) => new PostgresMembershipRepository(client.db, { kind: "tenant", tenantId }),
    }));

    describeApiKeyRepositoryContract("PostgresApiKeyRepository", () => ({
      registry: new PostgresApiKeyRepository(client.db, { kind: "registry" }),
      scopedTo: (tenantId) => new PostgresApiKeyRepository(client.db, { kind: "tenant", tenantId }),
    }));
  });
}
