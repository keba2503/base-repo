import type { TenantId } from "@base/domain";

export type StoredJob = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly maxAttempts: number;
};

export type EnqueueJobRequest = {
  readonly tenantId: TenantId;
  readonly name: string;
  readonly payload: unknown;
  readonly runAt?: Date;
  readonly maxAttempts?: number;
};

export type JobRetry = {
  readonly id: string;
  readonly retryAt: Date;
};

export const defaultJobMaxAttempts = 5;

export type JobQueue = {
  enqueue(request: EnqueueJobRequest): Promise<void>;
  claimDue(limit: number, now: Date): Promise<readonly StoredJob[]>;
  markCompleted(ids: readonly string[]): Promise<void>;
  markFailed(retries: readonly JobRetry[]): Promise<void>;
  markExhausted(ids: readonly string[]): Promise<void>;
};
