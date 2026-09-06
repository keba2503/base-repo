import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
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
import { tenantIdFactory } from "./factories/tenant";

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

    describe("tenant scoping opens with the transaction, never inherits it", () => {
      it("rejects an event enqueued for another tenant than the transaction scope", async () => {
        const unitOfWork = new PostgresUnitOfWork(client.db);
        const events = new PostgresOutbox(client.db);
        const ownTenant = tenantIdFactory(1);
        const otherTenant = tenantIdFactory(2);

        const attempt = unitOfWork.run({ kind: "tenant", tenantId: ownTenant }, () =>
          events.enqueue([
            { name: "tenant.created", tenantId: otherTenant, occurredAt: new Date(), payload: {} },
          ]),
        );
        const caught = await attempt.then(
          () => undefined,
          (error: unknown) => error,
        );

        expect(caught).toBeInstanceOf(Error);
      });

      it("lets a single enqueue run under its own tenant scope without an accidental platform grant", async () => {
        const unitOfWork = new PostgresUnitOfWork(client.db);
        const events = new PostgresOutbox(client.db);
        const ownTenant = tenantIdFactory(1);

        await unitOfWork.run({ kind: "tenant", tenantId: ownTenant }, () =>
          events.enqueue([{ name: "tenant.created", tenantId: ownTenant, occurredAt: new Date(), payload: {} }]),
        );

        const rows = await client.db.select().from(outbox);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.tenantId).toBe(ownTenant);
      });
    });
  });
}
