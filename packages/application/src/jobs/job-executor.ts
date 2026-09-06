import type { DomainError, Result } from "@base/domain";
import type { StoredJob } from "../kernel/ports/job-queue";

export type JobExecutor = {
  readonly jobName: string;
  execute(job: StoredJob): Promise<Result<void, DomainError>>;
};
