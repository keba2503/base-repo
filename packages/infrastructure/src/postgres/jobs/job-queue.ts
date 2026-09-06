import { and, eq, inArray, sql } from "drizzle-orm";
import {
  defaultJobMaxAttempts,
  defaultJobPriority,
  type EnqueueJobRequest,
  type JobPriority,
  type JobQueue,
  type JobRetry,
  type StoredJob,
  type TenantScope,
} from "@base/application";
import { isOk, parseTenantId } from "@base/domain";
import type { PostgresDatabase } from "../client";
import { backgroundJobPriority, interactiveJobPriority, jobs } from "../schema/index";
import { runScoped, type PostgresExecutor } from "../transaction-context";

type ClaimedJobRow = {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly priority: number;
};

function priorityRankOf(priority: JobPriority): number {
  return priority === "interactive" ? interactiveJobPriority : backgroundJobPriority;
}

function priorityOfRank(rank: number): JobPriority {
  return rank === interactiveJobPriority ? "interactive" : "background";
}

function toStoredJob(row: ClaimedJobRow): StoredJob {
  const tenantId = parseTenantId(row.tenantId);
  if (!isOk(tenantId)) {
    throw new Error(`A stored job carries an invalid tenant identifier: ${row.tenantId}`);
  }
  return {
    id: row.id,
    tenantId: tenantId.value,
    name: row.name,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    priority: priorityOfRank(row.priority),
  };
}

function toRowIds(ids: readonly string[]): bigint[] {
  return ids.map((id) => BigInt(id));
}

const immediatelyDue = new Date(0);

export class PostgresJobQueue implements JobQueue {
  readonly #db: PostgresDatabase;
  readonly #scope: TenantScope;

  constructor(db: PostgresDatabase, scope: TenantScope) {
    this.#db = db;
    this.#scope = scope;
  }

  async enqueue(request: EnqueueJobRequest): Promise<void> {
    if (this.#scope.kind === "tenant" && this.#scope.tenantId !== request.tenantId) {
      throw new Error("A tenant scoped job queue may not enqueue a job for another tenant");
    }
    await runScoped(this.#db, this.#scope, async (transaction) => {
      await transaction.insert(jobs).values({
        tenantId: request.tenantId,
        name: request.name,
        payload: request.payload,
        runAt: request.runAt ?? immediatelyDue,
        maxAttempts: request.maxAttempts ?? defaultJobMaxAttempts,
        priority: priorityRankOf(request.priority ?? defaultJobPriority),
      });
    });
  }

  claimDue(limit: number, now: Date): Promise<readonly StoredJob[]> {
    return runScoped(this.#db, this.#scope, async (transaction: PostgresExecutor) => {
      const tenantFilter = this.#scope.kind === "tenant" ? sql`and tenant_id = ${this.#scope.tenantId}` : sql``;
      const rows = (await transaction.execute(sql`
        with ranked as (
          select id,
            row_number() over (partition by tenant_id, priority order by run_at asc, id asc) as turn
          from jobs
          where completed_at is null and exhausted_at is null and run_at <= ${now.toISOString()} ${tenantFilter}
        )
        select
          jobs.id as id,
          jobs.tenant_id as "tenantId",
          jobs.name as name,
          jobs.payload as payload,
          jobs.attempts as attempts,
          jobs.max_attempts as "maxAttempts",
          jobs.priority as priority
        from jobs
        join ranked on ranked.id = jobs.id
        order by jobs.priority asc, ranked.turn asc, jobs.run_at asc, jobs.id asc
        limit ${limit}
        for update of jobs skip locked
      `)) as readonly ClaimedJobRow[];
      return rows.map(toStoredJob);
    });
  }

  async markCompleted(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await runScoped(this.#db, this.#scope, async (transaction) => {
      await transaction
        .update(jobs)
        .set({ completedAt: sql`now()` })
        .where(and(inArray(jobs.id, toRowIds(ids)), this.#scopeFilter()));
    });
  }

  async markFailed(retries: readonly JobRetry[]): Promise<void> {
    if (retries.length === 0) return;
    await runScoped(this.#db, this.#scope, async (transaction) => {
      for (const retry of retries) {
        await transaction
          .update(jobs)
          .set({ attempts: sql`${jobs.attempts} + 1`, runAt: retry.retryAt })
          .where(and(eq(jobs.id, BigInt(retry.id)), this.#scopeFilter()));
      }
    });
  }

  async markExhausted(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await runScoped(this.#db, this.#scope, async (transaction) => {
      await transaction
        .update(jobs)
        .set({ exhaustedAt: sql`now()` })
        .where(and(inArray(jobs.id, toRowIds(ids)), this.#scopeFilter()));
    });
  }

  #scopeFilter() {
    return this.#scope.kind === "tenant" ? eq(jobs.tenantId, this.#scope.tenantId) : undefined;
  }
}
