import type { AnonymizableSource, RetainableSource, SubjectDataSource } from "@base/application";
import { isOk, parseEmail, parseEntityId, parseTenantId, User, type EntityId, type TenantId } from "@base/domain";
import { and, eq, lt, notLike } from "drizzle-orm";
import type { PostgresDatabase } from "../client";
import { users } from "../schema/index";
import { runScoped } from "../transaction-context";

const anonymizedEmailDomain = "erased.invalid";

export function hydrateUser(row: { id: string; tenantId: string; email: string; displayName: string; createdAt: Date }): User {
  const id = parseEntityId(row.id);
  const tenantId = parseTenantId(row.tenantId);
  const email = parseEmail(row.email);
  if (!isOk(id) || !isOk(tenantId) || !isOk(email)) {
    throw new Error(`A stored user carries an invalid field: ${row.id}`);
  }
  const restored = User.restore({
    id: id.value,
    tenantId: tenantId.value,
    email: email.value,
    displayName: row.displayName,
    createdAt: row.createdAt,
  });
  if (!isOk(restored)) throw new Error(`A stored user violates its invariants: ${restored.error.code}`);
  return restored.value;
}

export class PostgresUserAnonymizableSource implements AnonymizableSource {
  readonly sourceName = "users";
  readonly #db: PostgresDatabase;

  constructor(db: PostgresDatabase) {
    this.#db = db;
  }

  async anonymize(tenantId: TenantId, subjectId: EntityId, token: string, at: Date): Promise<boolean> {
    return runScoped(this.#db, { kind: "tenant", tenantId }, async (transaction) => {
      const rows = await transaction.select().from(users).where(eq(users.id, subjectId)).limit(1);
      const row = rows[0];
      if (!row) return false;
      const user = hydrateUser(row);
      const anonymized = user.anonymize({ at, token });
      if (!isOk(anonymized)) return false;
      const snapshot = user.toSnapshot();
      await transaction
        .insert(users)
        .values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          email: snapshot.email,
          displayName: snapshot.displayName,
          createdAt: snapshot.createdAt,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: { email: snapshot.email, displayName: snapshot.displayName },
        });
      return true;
    });
  }
}

export class PostgresUserSubjectDataSource implements SubjectDataSource {
  readonly sourceName = "users";
  readonly classifications: SubjectDataSource["classifications"];
  readonly #db: PostgresDatabase;

  constructor(db: PostgresDatabase, classifications: SubjectDataSource["classifications"]) {
    this.#db = db;
    this.classifications = classifications;
  }

  findAllForSubject(tenantId: TenantId, subjectId: EntityId): Promise<readonly Readonly<Record<string, unknown>>[]> {
    return runScoped(this.#db, { kind: "tenant", tenantId }, async (transaction) => {
      const rows = await transaction.select().from(users).where(eq(users.id, subjectId));
      return rows.map((row) => ({ email: row.email, displayName: row.displayName }));
    });
  }
}

export class PostgresUserRetainableSource extends PostgresUserAnonymizableSource implements RetainableSource {
  readonly #db: PostgresDatabase;

  constructor(db: PostgresDatabase) {
    super(db);
    this.#db = db;
  }

  async findSubjectsOlderThan(tenantId: TenantId, cutoff: Date): Promise<readonly EntityId[]> {
    return runScoped(this.#db, { kind: "tenant", tenantId }, async (transaction) => {
      const rows = await transaction
        .select({ id: users.id })
        .from(users)
        .where(and(lt(users.createdAt, cutoff), notLike(users.email, `%@${anonymizedEmailDomain}`)));
      const expired: EntityId[] = [];
      for (const row of rows) {
        const parsed = parseEntityId(row.id);
        if (!isOk(parsed)) {
          throw new Error(`A stored user carries an invalid identifier: ${row.id}`);
        }
        expired.push(parsed.value);
      }
      return expired;
    });
  }
}
