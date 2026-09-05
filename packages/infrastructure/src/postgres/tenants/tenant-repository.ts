import type { TenantRepository, TenantScope } from "@base/application";
import { and, eq, type SQL } from "drizzle-orm";
import { isOk, parseTenantId, Tenant, type TenantId } from "@base/domain";
import type { PostgresDatabase } from "../client";
import { tenants, type TenantRow } from "../schema/index";
import { runScoped, type PostgresExecutor } from "../transaction-context";

function hydrate(row: TenantRow): Tenant {
  const id = parseTenantId(row.id);
  if (!isOk(id)) {
    throw new Error(`A stored tenant carries an invalid identifier: ${row.id}`);
  }
  const restored = Tenant.restore({ id: id.value, name: row.name, slug: row.slug, createdAt: row.createdAt });
  if (!isOk(restored)) {
    throw new Error(`A stored tenant violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class PostgresTenantRepository implements TenantRepository {
  readonly #db: PostgresDatabase;
  readonly #scope: TenantScope;

  constructor(db: PostgresDatabase, scope: TenantScope) {
    this.#db = db;
    this.#scope = scope;
  }

  #scopeFilter(): SQL | undefined {
    return this.#scope.kind === "tenant" ? eq(tenants.id, this.#scope.tenantId) : undefined;
  }

  #isVisible(id: TenantId): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === id;
  }

  async #findOne(executor: PostgresExecutor, condition: SQL): Promise<Tenant | undefined> {
    const rows = await executor
      .select()
      .from(tenants)
      .where(and(condition, this.#scopeFilter()))
      .limit(1);
    const row = rows[0];
    return row ? hydrate(row) : undefined;
  }

  findById(id: TenantId): Promise<Tenant | undefined> {
    return runScoped(this.#db, this.#scope, (transaction) => this.#findOne(transaction, eq(tenants.id, id)));
  }

  findBySlug(slug: string): Promise<Tenant | undefined> {
    return runScoped(this.#db, this.#scope, (transaction) => this.#findOne(transaction, eq(tenants.slug, slug)));
  }

  async save(tenant: Tenant): Promise<void> {
    if (!this.#isVisible(tenant.id)) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    const snapshot = tenant.toSnapshot();
    await runScoped(this.#db, this.#scope, async (transaction) => {
      await transaction
        .insert(tenants)
        .values({ id: snapshot.id, name: snapshot.name, slug: snapshot.slug, createdAt: snapshot.createdAt })
        .onConflictDoUpdate({
          target: tenants.id,
          set: { name: snapshot.name, slug: snapshot.slug },
        });
    });
  }
}
