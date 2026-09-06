import { ok } from "@base/domain";
import type { Clock } from "../../kernel/ports/clock";
import type { JobQueue } from "../../kernel/ports/job-queue";
import type { JobExecutor } from "../../jobs/job-executor";
import type { RetainableSource, RetentionPolicy } from "../ports/retainable-source";

export const retentionSweepJobName = "privacy.retention.sweep";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export type RetentionSweepDependencies = {
  readonly sources: readonly RetainableSource[];
  readonly policy: RetentionPolicy;
  readonly clock: Clock;
  readonly jobs: JobQueue;
  readonly sweepIntervalDays: number;
};

export function retentionSweepExecutor(dependencies: RetentionSweepDependencies): JobExecutor {
  const { sources, policy, clock, jobs, sweepIntervalDays } = dependencies;

  return {
    jobName: retentionSweepJobName,
    async execute(job) {
      const now = clock.now();
      for (const source of sources) {
        const retentionDays = policy[source.sourceName];
        if (retentionDays === undefined) continue;
        const cutoff = new Date(now.getTime() - retentionDays * millisecondsPerDay);
        const expired = await source.findSubjectsOlderThan(job.tenantId, cutoff);
        for (const subjectId of expired) {
          await source.anonymize(job.tenantId, subjectId, `expired-${subjectId}`, now);
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
