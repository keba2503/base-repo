import type { TenantScope, UserRepository } from "@base/application";
import { and, eq, type SQL } from "drizzle-orm";
import { isOk, parseEmail, parseEntityId, parseTenantId, User, type Email, type EntityId, type UserSnapshot } from "@base/domain";
import type { PostgresDatabase } from "../client";
import { users, type UserRow } from "../schema/index";
import { runScoped, type PostgresExecutor } from "../transaction-context";

function hydrate(row: UserRow): User {
  const id = parseEntityId(row.id);
  if (!isOk(id)) {
    throw new Error(`A stored user carries an invalid identifier: ${row.id}`);
  }
  const tenantId = parseTenantId(row.tenantId);
  if (!isOk(tenantId)) {
    throw new Error(`A stored user carries an invalid tenant identifier: ${row.tenantId}`);
  }
  const email = parseEmail(row.email);
  if (!isOk(email)) {
    throw new Error(`A stored user carries an invalid email: ${row.email}`);
  }
  const restored = User.restore({
    id: id.value,
    tenantId: tenantId.value,
    email: email.value,
    displayName: row.displayName,
    createdAt: row.createdAt,
  });
  if (!isOk(restored)) {
    throw new Error(`A stored user violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class PostgresUserRepository implements UserRepository {
  readonly #db: PostgresDatabase;
  readonly #scope: TenantScope;

  constructor(db: PostgresDatabase, scope: TenantScope) {
    this.#db = db;
    this.#scope = scope;
  }

  #scopeFilter(): SQL | undefined {
    return this.#scope.kind === "tenant" ? eq(users.tenantId, this.#scope.tenantId) : undefined;
  }

  #isVisible(snapshot: Pick<UserSnapshot, "tenantId">): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === snapshot.tenantId;
  }

  async #findOne(executor: PostgresExecutor, condition: SQL): Promise<User | undefined> {
    const rows = await executor
      .select()
      .from(users)
      .where(and(condition, this.#scopeFilter()))
      .limit(1);
    const row = rows[0];
    return row ? hydrate(row) : undefined;
  }

  findById(id: EntityId): Promise<User | undefined> {
    return runScoped(this.#db, this.#scope, (transaction) => this.#findOne(transaction, eq(users.id, id)));
  }

  findByEmail(email: Email): Promise<User | undefined> {
    return runScoped(this.#db, this.#scope, (transaction) => this.#findOne(transaction, eq(users.email, email)));
  }

  async save(user: User): Promise<void> {
    if (!this.#isVisible(user)) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    const snapshot = user.toSnapshot();
    await runScoped(this.#db, this.#scope, async (transaction) => {
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
    });
  }
}
