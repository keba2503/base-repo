import type { MembershipRepository, TenantScope } from "@base/application";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { isOk, isRole, Membership, parseEntityId, parseTenantId, type EntityId, type MembershipSnapshot } from "@base/domain";
import type { PostgresDatabase } from "../client";
import { memberships, type MembershipRow } from "../schema/index";
import { runScoped } from "../transaction-context";

function hydrate(row: MembershipRow): Membership {
  const userId = parseEntityId(row.userId);
  if (!isOk(userId)) {
    throw new Error(`A stored membership carries an invalid user identifier: ${row.userId}`);
  }
  const tenantId = parseTenantId(row.tenantId);
  if (!isOk(tenantId)) {
    throw new Error(`A stored membership carries an invalid tenant identifier: ${row.tenantId}`);
  }
  if (!isRole(row.role)) {
    throw new Error(`A stored membership carries an unknown role: ${row.role}`);
  }
  const restored = Membership.restore({ userId: userId.value, tenantId: tenantId.value, role: row.role });
  if (!isOk(restored)) {
    throw new Error(`A stored membership violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class PostgresMembershipRepository implements MembershipRepository {
  readonly #db: PostgresDatabase;
  readonly #scope: TenantScope;

  constructor(db: PostgresDatabase, scope: TenantScope) {
    this.#db = db;
    this.#scope = scope;
  }

  #scopeFilter(): SQL | undefined {
    return this.#scope.kind === "tenant" ? eq(memberships.tenantId, this.#scope.tenantId) : undefined;
  }

  #isVisible(snapshot: Pick<MembershipSnapshot, "tenantId">): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === snapshot.tenantId;
  }

  findByUserId(userId: EntityId): Promise<readonly Membership[]> {
    return runScoped(this.#db, this.#scope, async (transaction) => {
      const rows = await transaction
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, userId), this.#scopeFilter()))
        .orderBy(asc(memberships.grantedSequence));
      return rows.map(hydrate);
    });
  }

  async save(membership: Membership): Promise<void> {
    if (!this.#isVisible(membership)) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    const snapshot = membership.toSnapshot();
    await runScoped(this.#db, this.#scope, async (transaction) => {
      await transaction
        .insert(memberships)
        .values({ userId: snapshot.userId, tenantId: snapshot.tenantId, role: snapshot.role })
        .onConflictDoUpdate({
          target: [memberships.userId, memberships.tenantId],
          set: { role: snapshot.role },
        });
    });
  }
}
