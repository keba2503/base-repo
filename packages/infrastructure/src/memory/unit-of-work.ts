import type { TenantScope, UnitOfWork } from "@base/application";

export class InMemoryUnitOfWork implements UnitOfWork {
  #depth = 0;
  #scopes: TenantScope[] = [];

  async run<Value>(scope: TenantScope, work: () => Promise<Value>): Promise<Value> {
    this.#depth += 1;
    this.#scopes.push(scope);
    try {
      return await work();
    } finally {
      this.#depth -= 1;
    }
  }

  get isRunning(): boolean {
    return this.#depth > 0;
  }

  get scopes(): readonly TenantScope[] {
    return this.#scopes;
  }
}
