import type { TenantId } from "@base/domain";

export const jobPriorities = ["interactive", "background"] as const;

export type JobPriority = (typeof jobPriorities)[number];

export const defaultJobPriority: JobPriority = "background";

export type StoredJob = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly priority: JobPriority;
};

export type EnqueueJobRequest = {
  readonly tenantId: TenantId;
  readonly name: string;
  readonly payload: unknown;
  readonly runAt?: Date;
  readonly maxAttempts?: number;
  readonly priority?: JobPriority;
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
