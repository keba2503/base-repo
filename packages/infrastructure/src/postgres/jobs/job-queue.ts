import { and, asc, eq, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import {
  defaultJobMaxAttempts,
  type EnqueueJobRequest,
  type JobQueue,
  type JobRetry,
  type StoredJob,
  type TenantScope,
} from "@base/application";
import { isOk, parseTenantId } from "@base/domain";
import type { PostgresDatabase } from "../client";
import { jobs, type JobRow } from "../schema/index";
import { runScoped, type PostgresExecutor } from "../transaction-context";

function toStoredJob(row: JobRow): StoredJob {
  const tenantId = parseTenantId(row.tenantId);
  if (!isOk(tenantId)) {
    throw new Error(`A stored job carries an invalid tenant identifier: ${row.tenantId}`);
  }
  return {
    id: String(row.id),
    tenantId: tenantId.value,
    name: row.name,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
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

  #scopeFilter(): SQL | undefined {
    return this.#scope.kind === "tenant" ? eq(jobs.tenantId, this.#scope.tenantId) : undefined;
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
      });
    });
  }

  claimDue(limit: number, now: Date): Promise<readonly StoredJob[]> {
    return runScoped(this.#db, this.#scope, async (transaction: PostgresExecutor) => {
      const rows = await transaction
        .select()
        .from(jobs)
        .where(and(isNull(jobs.completedAt), isNull(jobs.exhaustedAt), lte(jobs.runAt, now), this.#scopeFilter()))
        .orderBy(asc(jobs.runAt), asc(jobs.id))
        .limit(limit)
        .for("update", { skipLocked: true });
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
}
