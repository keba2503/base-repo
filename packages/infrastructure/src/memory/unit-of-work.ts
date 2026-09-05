import type { UnitOfWork } from "@base/application";

export class InMemoryUnitOfWork implements UnitOfWork {
  #depth = 0;

  async run<Value>(work: () => Promise<Value>): Promise<Value> {
    this.#depth += 1;
    try {
      return await work();
    } finally {
      this.#depth -= 1;
    }
  }

  get isRunning(): boolean {
    return this.#depth > 0;
  }
}
