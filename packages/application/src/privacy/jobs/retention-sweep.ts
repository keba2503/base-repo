import { ok, type DomainError, type Result, type TenantId } from "@base/domain";
import type { Clock } from "../../kernel/ports/clock";
import type { JobQueue } from "../../kernel/ports/job-queue";
import type { IdGenerator } from "../../kernel/ports/id-generator";
import type { JobExecutor } from "../../jobs/job-executor";
import type { RetainableSource, RetentionPolicy } from "../ports/retainable-source";

export const retentionSweepJobName = "privacy.retention.sweep";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export type RetentionSweepDependencies = {
  readonly sources: readonly RetainableSource[];
  readonly policy: RetentionPolicy;
  readonly clock: Clock;
  readonly jobs: JobQueue;
  readonly tokens: IdGenerator;
  readonly sweepIntervalDays: number;
};

export function retentionSweepExecutor(dependencies: RetentionSweepDependencies): JobExecutor {
  const { sources, policy, clock, jobs, tokens, sweepIntervalDays } = dependencies;

  return {
    jobName: retentionSweepJobName,
    async execute(job): Promise<Result<void, DomainError>> {
      const now = clock.now();
      for (const source of sources) {
        const retentionDays = policy[source.sourceName];
        if (retentionDays === undefined) continue;
        const cutoff = new Date(now.getTime() - retentionDays * millisecondsPerDay);
        const expired = await source.findSubjectsOlderThan(job.tenantId, cutoff);
        for (const subjectId of expired) {
          await source.anonymize(job.tenantId, subjectId, tokens.next(), now);
        }
      }
      await jobs.enqueue({
        tenantId: job.tenantId,
        name: retentionSweepJobName,
        payload: {},
        runAt: new Date(now.getTime() + sweepIntervalDays * millisecondsPerDay),
      });
      return ok(undefined);
    },
  };
}

export function scheduleFirstRetentionSweep(dependencies: {
  readonly jobs: JobQueue;
  readonly tenantId: TenantId;
  readonly clock: Clock;
  readonly sweepIntervalDays: number;
}): Promise<void> {
  const firstRunAt = new Date(dependencies.clock.now().getTime() + dependencies.sweepIntervalDays * millisecondsPerDay);
  return dependencies.jobs.enqueue({
    tenantId: dependencies.tenantId,
    name: retentionSweepJobName,
    payload: {},
    runAt: firstRunAt,
  }).then(() => undefined);
}
