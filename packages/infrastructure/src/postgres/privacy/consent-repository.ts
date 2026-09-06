import type { ConsentRepository } from "@base/application";
import { and, desc, eq } from "drizzle-orm";
import { Consent, isOk, parseEntityId, parseTenantId, type ConsentCategory, type ConsentSnapshot, type EntityId, type TenantId } from "@base/domain";
import type { PostgresDatabase } from "../client";
import { consents, type ConsentRow } from "../schema/index";
import { runScoped } from "../transaction-context";

function hydrate(row: ConsentRow): Consent {
  const id = parseEntityId(row.id);
  const tenantId = parseTenantId(row.tenantId);
  const subjectId = parseEntityId(row.subjectId);
  if (!isOk(id) || !isOk(tenantId) || !isOk(subjectId)) {
    throw new Error(`A stored consent carries an invalid identifier: ${row.id}`);
  }
  const snapshot: ConsentSnapshot = {
    id: id.value,
    tenantId: tenantId.value,
    subjectId: subjectId.value,
    category: row.category as ConsentCategory,
    policyVersion: row.policyVersion,
    grantedAt: row.grantedAt,
    withdrawnAt: row.withdrawnAt,
    sourceIpAddress: row.sourceIpAddress,
    sourceUserAgent: row.sourceUserAgent,
  };
  const restored = Consent.restore(snapshot);
  if (!isOk(restored)) {
    throw new Error(`A stored consent violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class PostgresConsentRepository implements ConsentRepository {
  readonly #db: PostgresDatabase;
  readonly #tenantId: TenantId;

  constructor(db: PostgresDatabase, tenantId: TenantId) {
    this.#db = db;
    this.#tenantId = tenantId;
  }

  findActive(subjectId: EntityId, category: ConsentCategory): Promise<Consent | undefined> {
    return runScoped(this.#db, { kind: "tenant", tenantId: this.#tenantId }, async (transaction) => {
      const rows = await transaction
        .select()
        .from(consents)
        .where(and(eq(consents.subjectId, subjectId), eq(consents.category, category)))
        .orderBy(desc(consents.grantedAt));
      const active = rows.find((row) => row.withdrawnAt === null);
      return active ? hydrate(active) : undefined;
    });
  }

  findAllForSubject(subjectId: EntityId): Promise<readonly Consent[]> {
    return runScoped(this.#db, { kind: "tenant", tenantId: this.#tenantId }, async (transaction) => {
      const rows = await transaction.select().from(consents).where(eq(consents.subjectId, subjectId));
      return rows.map(hydrate);
    });
  }

  async save(consent: Consent): Promise<void> {
    if (consent.tenantId !== this.#tenantId) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    const snapshot = consent.toSnapshot();
    await runScoped(this.#db, { kind: "tenant", tenantId: this.#tenantId }, async (transaction) => {
      await transaction
        .insert(consents)
        .values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          grantedAt: snapshot.grantedAt,
          subjectId: snapshot.subjectId,
          category: snapshot.category,
          policyVersion: snapshot.policyVersion,
          withdrawnAt: snapshot.withdrawnAt,
          sourceIpAddress: snapshot.sourceIpAddress,
          sourceUserAgent: snapshot.sourceUserAgent,
        })
        .onConflictDoUpdate({
          target: consents.id,
          set: { withdrawnAt: snapshot.withdrawnAt },
        });
    });
  }
}
