import type { JobExecutor } from "./job-executor";

export type ExecutorRegistry = {
  readonly jobNames: readonly string[];
  executorFor(jobName: string): JobExecutor | undefined;
};

export function executorRegistry(executors: readonly JobExecutor[]): ExecutorRegistry {
  const byJobName = new Map<string, JobExecutor>();
  for (const executor of executors) {
    if (byJobName.has(executor.jobName)) {
      throw new Error(`Two executors are registered for the job ${executor.jobName}`);
    }
    byJobName.set(executor.jobName, executor);
  }

  return {
    jobNames: [...byJobName.keys()],
    executorFor: (jobName) => byJobName.get(jobName),
  };
}
