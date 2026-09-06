import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { asc, eq, sql } from "drizzle-orm";
import {
  aesGcmKeyByteLength,
  AesGcmFieldCipher,
  apiKeys,
  auditLog,
  consents,
  createPostgresClient,
  documents,
  jobs,
  memberships,
  outbox,
  outboxRowToEvent,
  PostgresApiKeyRepository,
  PostgresAuditTrail,
  PostgresConsentRepository,
  PostgresDocumentRepository,
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
  describeAuditTrailContract,
  describeConsentRepositoryContract,
  describeDocumentRepositoryContract,
  describeJobQueueContract,
  describeMembershipRepositoryContract,
  describeOutboxContract,
  describeTenantRepositoryContract,
  describeUnitOfWorkContract,
  describeUserRepositoryContract,
} from "./contracts/index";
import { tenantIdFactory } from "./factories/tenant";
import { auditEntryInputFactory } from "./factories/audit";
import { documentFactory } from "./factories/document";
import { entityIdFactory } from "./factories/identity";

const testFieldCipher = new AesGcmFieldCipher({ keys: [{ id: "test", key: Buffer.alloc(aesGcmKeyByteLength, 7) }] });

const databaseUrlVariable = "DATABASE_URL";
const databaseAdminUrlVariable = "DATABASE_ADMIN_URL";
const databaseUrl = process.env[databaseUrlVariable];
const databaseAdminUrl = process.env[databaseAdminUrlVariable];
const migrationTimeoutMilliseconds = 60_000;

const missingVariables = [
  ...(databaseUrl ? [] : [databaseUrlVariable]),
  ...(databaseAdminUrl ? [] : [databaseAdminUrlVariable]),
];

const suiteIsRequired = process.env.POSTGRES_SUITE_REQUIRED === "1";

if ((!databaseUrl || !databaseAdminUrl) && suiteIsRequired) {
  throw new Error(
    `POSTGRES_SUITE_REQUIRED is set, so this suite may not be skipped, but ${missingVariables.join(" and ")} is missing`,
  );
}

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
        sql`truncate table ${outbox}, ${jobs}, ${tenants}, ${users}, ${memberships}, ${apiKeys}, ${documents}, ${consents}, ${auditLog}`,
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

    describeDocumentRepositoryContract("PostgresDocumentRepository", () => ({
      registry: new PostgresDocumentRepository(client.db, { kind: "registry" }, testFieldCipher),
      scopedTo: (tenantId) => new PostgresDocumentRepository(client.db, { kind: "tenant", tenantId }, testFieldCipher),
    }));

    describeConsentRepositoryContract("PostgresConsentRepository", () => ({
      consents: new PostgresConsentRepository(client.db, tenantIdFactory(1)),
    }));

    describeAuditTrailContract("PostgresAuditTrail", () => ({
      audit: new PostgresAuditTrail(client.db, tenantIdFactory(1)),
    }));

    describe("PostgresAuditTrail row level security isolates tenants independently of the application filter", () => {
      it("hides another tenant's audit entry from a raw, unfiltered select once the connection is scoped", async () => {
        const ownTenant = tenantIdFactory(1);
        const otherTenant = tenantIdFactory(2);

        await new PostgresAuditTrail(client.db, ownTenant).record(auditEntryInputFactory({ tenantId: ownTenant }));
        await new PostgresAuditTrail(client.db, otherTenant).record(auditEntryInputFactory({ tenantId: otherTenant }));

        const visibleToOwnTenant = await runScoped(client.db, { kind: "tenant", tenantId: ownTenant }, (transaction) =>
          transaction.select().from(auditLog),
        );

        expect(visibleToOwnTenant).toHaveLength(1);
        expect(visibleToOwnTenant[0]?.tenantId).toBe(ownTenant);
      });
    });

    describe("audit_log is append only", () => {
      it("rejects an update attempted through the application connection", async () => {
        const ownTenant = tenantIdFactory(1);
        await new PostgresAuditTrail(client.db, ownTenant).record(auditEntryInputFactory({ tenantId: ownTenant }));

        const attempt = runScoped(client.db, { kind: "tenant", tenantId: ownTenant }, (transaction) =>
          transaction.update(auditLog).set({ action: "tampered" }).where(eq(auditLog.tenantId, ownTenant)),
        );
        const caught = await attempt.then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(caught).toBeInstanceOf(Error);
      });

      it("rejects a delete attempted through the application connection", async () => {
        const ownTenant = tenantIdFactory(1);
        await new PostgresAuditTrail(client.db, ownTenant).record(auditEntryInputFactory({ tenantId: ownTenant }));

        const attempt = runScoped(client.db, { kind: "tenant", tenantId: ownTenant }, (transaction) =>
          transaction.delete(auditLog).where(eq(auditLog.tenantId, ownTenant)),
        );
        const caught = await attempt.then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(caught).toBeInstanceOf(Error);
      });
    });

    describe("PostgresDocumentRepository encrypts the sensitive extracted text field", () => {
      it("stores the extracted text unreadable in the raw table", async () => {
        const registry = new PostgresDocumentRepository(client.db, { kind: "registry" }, testFieldCipher);
        const document = documentFactory({ id: entityIdFactory(1), storageKey: entityIdFactory(1) });
        document.startProcessing(new Date("2026-01-16T10:00:00.000Z"));
        document.complete({ at: new Date("2026-01-16T10:05:00.000Z"), extractedText: "diagnóstico confidencial del paciente" });
        await registry.save(document);

        const rows = await client.db.select().from(documents).where(eq(documents.id, entityIdFactory(1)));
        const rawExtractedText = rows[0]?.extractedText;
        expect(rawExtractedText).not.toBeNull();
        expect(rawExtractedText?.includes("diagnóstico confidencial del paciente")).toBe(false);

        const found = await registry.findById(entityIdFactory(1));
        expect(found?.extractedText).toBe("diagnóstico confidencial del paciente");
      });
    });

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

    describe("PostgresDocumentRepository row level security isolates tenants independently of the application filter", () => {
      it("hides another tenant's document from a raw, unfiltered select once the connection is scoped", async () => {
        const registry = new PostgresDocumentRepository(client.db, { kind: "registry" }, testFieldCipher);
        const ownTenant = tenantIdFactory(1);
        const otherTenant = tenantIdFactory(2);

        await registry.save(documentFactory({ id: entityIdFactory(1), tenantId: ownTenant, storageKey: entityIdFactory(1) }));
        await registry.save(documentFactory({ id: entityIdFactory(2), tenantId: otherTenant, storageKey: entityIdFactory(2) }));

        const visibleToOwnTenant = await runScoped(client.db, { kind: "tenant", tenantId: ownTenant }, (transaction) =>
          transaction.select().from(documents),
        );

        expect(visibleToOwnTenant).toHaveLength(1);
        expect(visibleToOwnTenant[0]?.tenantId).toBe(ownTenant);
      });

      it("lets the registry scope see documents from every tenant", async () => {
        const registry = new PostgresDocumentRepository(client.db, { kind: "registry" }, testFieldCipher);
        const ownTenant = tenantIdFactory(1);
        const otherTenant = tenantIdFactory(2);

        await registry.save(documentFactory({ id: entityIdFactory(1), tenantId: ownTenant, storageKey: entityIdFactory(1) }));
        await registry.save(documentFactory({ id: entityIdFactory(2), tenantId: otherTenant, storageKey: entityIdFactory(2) }));

        const listed = await registry.list({ limit: 10 });
        expect(listed.map((document) => document.tenantId).sort()).toEqual([ownTenant, otherTenant].sort());
      });
    });
  });
}
