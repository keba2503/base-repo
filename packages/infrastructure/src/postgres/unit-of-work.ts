import type { UnitOfWork } from "@base/application";
import type { PostgresDatabase } from "./client";
import { runInTransaction } from "./transaction-context";

export class PostgresUnitOfWork implements UnitOfWork {
  readonly #db: PostgresDatabase;

  constructor(db: PostgresDatabase) {
    this.#db = db;
  }

  run<Value>(work: () => Promise<Value>): Promise<Value> {
    return runInTransaction(this.#db, () => work());
  }
}
