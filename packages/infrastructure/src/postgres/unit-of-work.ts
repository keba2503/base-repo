import type { TenantScope, UnitOfWork } from "@base/application";
import type { PostgresDatabase } from "./client";
import { runScoped } from "./transaction-context";

export class PostgresUnitOfWork implements UnitOfWork {
  readonly #db: PostgresDatabase;

  constructor(db: PostgresDatabase) {
    this.#db = db;
  }

  run<Value>(scope: TenantScope, work: () => Promise<Value>): Promise<Value> {
    return runScoped(this.#db, scope, () => work());
  }
}
