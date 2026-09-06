import type { EnqueueJobRequest, JobPriority, JobQueue, JobRetry, StoredJob, TenantScope } from "@base/application";
import { defaultJobMaxAttempts, defaultJobPriority } from "@base/application";

type Row = {
  readonly id: string;
  readonly tenantId: StoredJob["tenantId"];
  readonly name: string;
  readonly payload: unknown;
  attempts: number;
  readonly maxAttempts: number;
  readonly priority: JobPriority;
  runAt: number;
  completedAt: number | null;
  exhaustedAt: number | null;
};

export class InMemoryJobStore {
  readonly rows: Row[] = [];
  sequence = 0;
}

function priorityRankOf(priority: JobPriority): number {
  return priority === "interactive" ? 0 : 1;
}

function toStoredJob(row: Row): StoredJob {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    priority: row.priority,
  };
}

function byArrivalWithinPartition(a: Row, b: Row): number {
  if (a.runAt !== b.runAt) return a.runAt - b.runAt;
  return Number(a.id) - Number(b.id);
}

function fairlyOrdered(due: readonly Row[]): readonly Row[] {
  const sorted = [...due].sort((a, b) => {
    if (a.tenantId !== b.tenantId) return a.tenantId < b.tenantId ? -1 : 1;
    if (a.priority !== b.priority) return priorityRankOf(a.priority) - priorityRankOf(b.priority);
    return byArrivalWithinPartition(a, b);
  });

  const turnOf = new Map<string, number>();
  const ranked = sorted.map((row) => {
    const key = `${row.tenantId}:${row.priority}`;
    const turn = (turnOf.get(key) ?? 0) + 1;
    turnOf.set(key, turn);
    return { row, turn };
  });

  ranked.sort((a, b) => {
    const priorityOrder = priorityRankOf(a.row.priority) - priorityRankOf(b.row.priority);
    if (priorityOrder !== 0) return priorityOrder;
    if (a.turn !== b.turn) return a.turn - b.turn;
    return byArrivalWithinPartition(a.row, b.row);
  });

  return ranked.map((entry) => entry.row);
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
      priority: request.priority ?? defaultJobPriority,
      runAt: request.runAt?.getTime() ?? 0,
      completedAt: null,
      exhaustedAt: null,
    });
    return Promise.resolve();
  }

  claimDue(limit: number, now: Date): Promise<readonly StoredJob[]> {
    const due = this.#store.rows.filter(
      (row) =>
        this.#isVisible(row) && row.completedAt === null && row.exhaustedAt === null && row.runAt <= now.getTime(),
    );
    const claimed = fairlyOrdered(due)
      .slice(0, limit)
      .map(toStoredJob);
    return Promise.resolve(claimed);
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
