import type { EnqueueJobRequest, JobQueue, JobRetry, StoredJob, TenantScope } from "@base/application";
import { defaultJobMaxAttempts } from "@base/application";

type Row = {
  readonly id: string;
  readonly tenantId: StoredJob["tenantId"];
  readonly name: string;
  readonly payload: unknown;
  attempts: number;
  readonly maxAttempts: number;
  runAt: number;
  completedAt: number | null;
  exhaustedAt: number | null;
};

export class InMemoryJobStore {
  readonly rows: Row[] = [];
  sequence = 0;
}

function toStoredJob(row: Row): StoredJob {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
  };
}

export class InMemoryJobQueue implements JobQueue {
  readonly #store: InMemoryJobStore;
  readonly #scope: TenantScope;

  constructor(store: InMemoryJobStore, scope: TenantScope) {
    this.#store = store;
    this.#scope = scope;
  }

  #isVisible(row: Row): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === row.tenantId;
  }

  enqueue(request: EnqueueJobRequest): Promise<void> {
    if (this.#scope.kind === "tenant" && this.#scope.tenantId !== request.tenantId) {
      throw new Error("A tenant scoped job queue may not enqueue a job for another tenant");
    }
    this.#store.sequence += 1;
    this.#store.rows.push({
      id: String(this.#store.sequence),
      tenantId: request.tenantId,
      name: request.name,
      payload: request.payload,
      attempts: 0,
      maxAttempts: request.maxAttempts ?? defaultJobMaxAttempts,
      runAt: request.runAt?.getTime() ?? 0,
      completedAt: null,
      exhaustedAt: null,
    });
    return Promise.resolve();
  }

  claimDue(limit: number, now: Date): Promise<readonly StoredJob[]> {
    const due = this.#store.rows
      .filter(
        (row) =>
          this.#isVisible(row) && row.completedAt === null && row.exhaustedAt === null && row.runAt <= now.getTime(),
      )
      .slice(0, limit)
      .map(toStoredJob);
    return Promise.resolve(due);
  }

  markCompleted(ids: readonly string[]): Promise<void> {
    for (const row of this.#store.rows) {
      if (this.#isVisible(row) && ids.includes(row.id)) row.completedAt = Date.now();
    }
    return Promise.resolve();
  }

  markFailed(retries: readonly JobRetry[]): Promise<void> {
    const retryAtById = new Map(retries.map((retry) => [retry.id, retry.retryAt.getTime()]));
    for (const row of this.#store.rows) {
      const retryAt = retryAtById.get(row.id);
      if (retryAt === undefined || !this.#isVisible(row)) continue;
      row.attempts += 1;
      row.runAt = retryAt;
    }
    return Promise.resolve();
  }

  markExhausted(ids: readonly string[]): Promise<void> {
    for (const row of this.#store.rows) {
      if (this.#isVisible(row) && ids.includes(row.id)) row.exhaustedAt = Date.now();
    }
    return Promise.resolve();
  }
}
