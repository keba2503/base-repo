import { AsyncLocalStorage } from "node:async_hooks";
import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { TenantScope } from "@base/application";
import type { PostgresDatabase, PostgresSchema } from "./client";

type PostgresTables = ExtractTablesWithRelations<PostgresSchema>;

export type PostgresExecutor = PgDatabase<PostgresJsQueryResultHKT, PostgresSchema, PostgresTables>;

export type PostgresTransaction = PgTransaction<PostgresJsQueryResultHKT, PostgresSchema, PostgresTables>;

const ambientTransaction = new AsyncLocalStorage<PostgresTransaction>();

type BypassRlsRow = { readonly rolbypassrls: boolean };

async function assertRoleCannotBypassRowLevelSecurity(db: PostgresDatabase): Promise<void> {
  const rows = (await db.execute(
    sql`select rolbypassrls from pg_roles where rolname = current_user`,
  )) as readonly BypassRlsRow[];
  if (rows[0]?.rolbypassrls === true) {
    throw new Error(
      "The Postgres role connected to this client may bypass row level security; tenant isolation cannot be trusted",
    );
  }
}

const rowLevelSecurityVerifications = new WeakMap<PostgresDatabase, Promise<void>>();

function verifiedRowLevelSecurity(db: PostgresDatabase): Promise<void> {
  const cached = rowLevelSecurityVerifications.get(db);
  if (cached) return cached;
  const verification = assertRoleCannotBypassRowLevelSecurity(db);
  rowLevelSecurityVerifications.set(db, verification);
  return verification;
}

export function runInTransaction<Value>(
  db: PostgresDatabase,
  work: (transaction: PostgresTransaction) => Promise<Value>,
): Promise<Value> {
  const ambient = ambientTransaction.getStore();
  if (ambient) return work(ambient);
  return verifiedRowLevelSecurity(db).then(() =>
    db.transaction((transaction) => ambientTransaction.run(transaction, () => work(transaction))),
  );
}

export const tenantSettingName = "app.tenant_id";

export async function applyTenantScope(executor: PostgresExecutor, scope: TenantScope): Promise<void> {
  const value = scope.kind === "tenant" ? scope.tenantId : "";
  await executor.execute(sql`select set_config(${tenantSettingName}, ${value}, true)`);
}

export function runScoped<Value>(
  db: PostgresDatabase,
  scope: TenantScope,
  work: (transaction: PostgresTransaction) => Promise<Value>,
): Promise<Value> {
  return runInTransaction(db, async (transaction) => {
    await applyTenantScope(transaction, scope);
    return work(transaction);
  });
}
