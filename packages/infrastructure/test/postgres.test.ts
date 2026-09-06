import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { asc, sql } from "drizzle-orm";
import {
  apiKeys,
  createPostgresClient,
  jobs,
  memberships,
  outbox,
  outboxRowToEvent,
  PostgresApiKeyRepository,
  PostgresJobQueue,
  PostgresMembershipRepository,
  PostgresOutbox,
  PostgresTenantRepository,
  PostgresUnitOfWork,
  PostgresUserRepository,
  runScoped,
  tenants,
  users,
  type PostgresClient,
} from "@base/infrastructure";
import { migrateDatabase } from "../src/postgres/migrate";
import {
  describeApiKeyRepositoryContract,
  describeJobQueueContract,
  describeMembershipRepositoryContract,
  describeOutboxContract,
  describeTenantRepositoryContract,
  describeUnitOfWorkContract,
  describeUserRepositoryContract,
} from "./contracts/index";
import { tenantIdFactory } from "./factories/tenant";

const databaseUrlVariable = "DATABASE_URL";
const databaseAdminUrlVariable = "DATABASE_ADMIN_URL";
const databaseUrl = process.env[databaseUrlVariable];
const databaseAdminUrl = process.env[databaseAdminUrlVariable];
const migrationTimeoutMilliseconds = 60_000;

const missingVariables = [
  ...(databaseUrl ? [] : [databaseUrlVariable]),
  ...(databaseAdminUrl ? [] : [databaseAdminUrlVariable]),
];

if (!databaseUrl || !databaseAdminUrl) {
  console.warn(
    `Skipping the Postgres contract suites: set ${missingVariables.join(" and ")} to run them (${databaseUrlVariable} is the app_user connection the repositories under test use, ${databaseAdminUrlVariable} is a privileged connection used only to migrate and truncate between tests)`,
  );
  describe.skip("Postgres contract suites", () => {
    it(`run when ${databaseUrlVariable} and ${databaseAdminUrlVariable} are set`, () => undefined);
  });
} else {
  describePostgresSuites(databaseUrl, databaseAdminUrl);
}

function describePostgresSuites(connectionString: string, adminConnectionString: string): void {
  describe("Postgres", () => {
    let client: PostgresClient;
    let adminClient: PostgresClient;

    beforeAll(async () => {
      client = createPostgresClient({ connectionString, maxConnections: 4 });
      adminClient = createPostgresClient({ connectionString: adminConnectionString, maxConnections: 2 });
      await migrateDatabase(adminClient.db);
    }, migrationTimeoutMilliseconds);

    beforeEach(async () => {
      await adminClient.db.execute(
        sql`truncate table ${outbox}, ${jobs}, ${tenants}, ${users}, ${memberships}, ${apiKeys}`,
      );
    });

    afterAll(async () => {
      await client.close();
      await adminClient.close();
    });

    describeUnitOfWorkContract("PostgresUnitOfWork", () => new PostgresUnitOfWork(client.db));

    describeOutboxContract("PostgresOutbox", () => ({
      outbox: new PostgresOutbox(client.db),
      enqueued: async () => {
        const rows = await client.db.select().from(outbox).orderBy(asc(outbox.id));
        return rows.map(outboxRowToEvent);
      },
    }));

    describeJobQueueContract("PostgresJobQueue", () => ({
      registry: new PostgresJobQueue(client.db, { kind: "registry" }),
      scopedTo: (tenantId) => new PostgresJobQueue(client.db, { kind: "tenant", tenantId }),
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

    describe("PostgresJobQueue row level security isolates tenants independently of the application filter", () => {
      it("hides another tenant's job from a raw, unfiltered select once the connection is scoped", async () => {
        const registry = new PostgresJobQueue(client.db, { kind: "registry" });
        const ownTenant = tenantIdFactory(1);
        const otherTenant = tenantIdFactory(2);

        await registry.enqueue({ tenantId: ownTenant, name: "reports.generate", payload: {} });
        await registry.enqueue({ tenantId: otherTenant, name: "reports.generate", payload: {} });

        const visibleToOwnTenant = await runScoped(client.db, { kind: "tenant", tenantId: ownTenant }, (transaction) =>
          transaction.select().from(jobs),
        );

        expect(visibleToOwnTenant).toHaveLength(1);
        expect(visibleToOwnTenant[0]?.tenantId).toBe(ownTenant);
      });

      it("lets the registry scope see jobs from every tenant", async () => {
        const registry = new PostgresJobQueue(client.db, { kind: "registry" });
        const ownTenant = tenantIdFactory(1);
        const otherTenant = tenantIdFactory(2);

        await registry.enqueue({ tenantId: ownTenant, name: "reports.generate", payload: {} });
        await registry.enqueue({ tenantId: otherTenant, name: "reports.generate", payload: {} });

        const claimed = await registry.claimDue(10, new Date());
        expect(claimed.map((job) => job.tenantId).sort()).toEqual([ownTenant, otherTenant].sort());
      });
    });
  });
}
