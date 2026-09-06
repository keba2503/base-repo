import type { ApiKeyRepository, TenantScope } from "@base/application";
import { and, eq, type SQL } from "drizzle-orm";
import {
  ApiKey,
  isOk,
  isPermissionAction,
  parseEntityId,
  parseTenantId,
  type ApiKeySnapshot,
  type EntityId,
  type PermissionAction,
} from "@base/domain";
import type { PostgresDatabase } from "../client";
import { apiKeys, type ApiKeyRow } from "../schema/index";
import { runScoped, type PostgresExecutor } from "../transaction-context";

function hydrateScopes(row: ApiKeyRow): readonly PermissionAction[] {
  const unknown = row.scopes.find((scope) => !isPermissionAction(scope));
  if (unknown !== undefined) {
    throw new Error(`A stored api key carries an unknown scope: ${unknown}`);
  }
  return row.scopes.filter(isPermissionAction);
}

function hydrate(row: ApiKeyRow): ApiKey {
  const id = parseEntityId(row.id);
  if (!isOk(id)) {
    throw new Error(`A stored api key carries an invalid identifier: ${row.id}`);
  }
  const tenantId = parseTenantId(row.tenantId);
  if (!isOk(tenantId)) {
    throw new Error(`A stored api key carries an invalid tenant identifier: ${row.tenantId}`);
  }
  const restored = ApiKey.restore({
    id: id.value,
    tenantId: tenantId.value,
    name: row.name,
    keyPrefix: row.keyPrefix,
    keyHash: row.keyHash,
    scopes: hydrateScopes(row),
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  });
  if (!isOk(restored)) {
    throw new Error(`A stored api key violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class PostgresApiKeyRepository implements ApiKeyRepository {
  readonly #db: PostgresDatabase;
  readonly #scope: TenantScope;

  constructor(db: PostgresDatabase, scope: TenantScope) {
    this.#db = db;
    this.#scope = scope;
  }

  #scopeFilter(): SQL | undefined {
    return this.#scope.kind === "tenant" ? eq(apiKeys.tenantId, this.#scope.tenantId) : undefined;
  }

  #isVisible(snapshot: Pick<ApiKeySnapshot, "tenantId">): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === snapshot.tenantId;
  }

  async #findOne(executor: PostgresExecutor, condition: SQL): Promise<ApiKey | undefined> {
    const rows = await executor
      .select()
      .from(apiKeys)
      .where(and(condition, this.#scopeFilter()))
      .limit(1);
    const row = rows[0];
    return row ? hydrate(row) : undefined;
  }

  findById(id: EntityId): Promise<ApiKey | undefined> {
    return runScoped(this.#db, this.#scope, (transaction) => this.#findOne(transaction, eq(apiKeys.id, id)));
  }

  findByPrefix(keyPrefix: string): Promise<ApiKey | undefined> {
    return runScoped(this.#db, this.#scope, (transaction) =>
      this.#findOne(transaction, eq(apiKeys.keyPrefix, keyPrefix)),
    );
  }

  async save(apiKey: ApiKey): Promise<void> {
    if (!this.#isVisible(apiKey)) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    const snapshot = apiKey.toSnapshot();
    await runScoped(this.#db, this.#scope, async (transaction) => {
      await transaction
        .insert(apiKeys)
        .values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          name: snapshot.name,
          keyPrefix: snapshot.keyPrefix,
          keyHash: snapshot.keyHash,
          scopes: [...snapshot.scopes],
          createdAt: snapshot.createdAt,
          revokedAt: snapshot.revokedAt,
        })
        .onConflictDoUpdate({
          target: apiKeys.id,
          set: {
            name: snapshot.name,
            keyHash: snapshot.keyHash,
            scopes: [...snapshot.scopes],
            revokedAt: snapshot.revokedAt,
          },
        });
    });
  }
}
