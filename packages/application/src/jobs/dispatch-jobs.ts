import { isErr, ok, unavailable, type DomainError, type Result } from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { Clock } from "../kernel/ports/clock";
import type { JobQueue, StoredJob } from "../kernel/ports/job-queue";
import type { Logger } from "../kernel/ports/logger";
import type { Permissions } from "../kernel/ports/permissions";
import type { ExecutorRegistry } from "./executor-registry";
import {
  dispatchJobsAction,
  jobExecutorThrewCode,
  jobQueueResource,
  type DispatchJobsRequest,
  type DispatchJobsResponse,
} from "./models";

export type DispatchJobsDependencies = {
  readonly jobs: JobQueue;
  readonly executors: ExecutorRegistry;
  readonly permissions: Permissions;
  readonly logger: Logger;
  readonly clock: Clock;
};

export type DispatchJobs = (request: DispatchJobsRequest) => Promise<Result<DispatchJobsResponse, DomainError>>;

type Disposition = "completed" | "failed" | "unhandled" | "exhausted";

function backoffMilliseconds(attemptsAfterThisFailure: number): number {
  return 2 ** attemptsAfterThisFailure * 1_000;
}

function failureOf(thrown: unknown): DomainError {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return unavailable(jobExecutorThrewCode, message);
}

async function runExecutor(
  executors: ExecutorRegistry,
  job: StoredJob,
): Promise<{ readonly found: false } | { readonly found: true; readonly failure: DomainError | undefined }> {
  const executor = executors.executorFor(job.name);
  if (!executor) return { found: false };
  try {
    const result = await executor.execute(job);
    return { found: true, failure: isErr(result) ? result.error : undefined };
  } catch (thrown: unknown) {
    return { found: true, failure: failureOf(thrown) };
  }
}

export function dispatchJobs(dependencies: DispatchJobsDependencies): DispatchJobs {
  const { jobs, executors, permissions, logger, clock } = dependencies;

  async function retryOrExhaust(job: StoredJob): Promise<boolean> {
    const attempts = job.attempts + 1;
    if (attempts >= job.maxAttempts) {
      await jobs.markExhausted([job.id]);
      return true;
    }
    const retryAt = new Date(clock.now().getTime() + backoffMilliseconds(attempts));
    await jobs.markFailed([{ id: job.id, retryAt }]);
    return false;
  }

  async function settle(job: StoredJob): Promise<Disposition> {
    const fields = { jobId: job.id, jobName: job.name, attempts: job.attempts };
    const outcome = await runExecutor(executors, job);

    if (!outcome.found) {
      const exhausted = await retryOrExhaust(job);
      if (exhausted) {
        logger.error("job exhausted its attempts", fields);
      } else {
        logger.warn("job has no executor", fields);
      }
      return "unhandled";
    }

    if (!outcome.failure) {
      await jobs.markCompleted([job.id]);
      return "completed";
    }

    const failureFields = { ...fields, code: outcome.failure.code, reason: outcome.failure.message };
    const exhausted = await retryOrExhaust(job);
    logger.error(exhausted ? "job exhausted its attempts" : "job failed", failureFields);
    return exhausted ? "exhausted" : "failed";
  }

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: dispatchJobsAction,
      resource: jobQueueResource,
    });
    if (isErr(authorization)) return authorization;

    const claimed = await jobs.claimDue(request.limit, clock.now());
    const counts: Record<Disposition, number> = { completed: 0, failed: 0, unhandled: 0, exhausted: 0 };
    for (const job of claimed) {
      const disposition = await settle(job);
      counts[disposition] += 1;
    }

    return ok({ claimed: claimed.length, ...counts });
  };
}
