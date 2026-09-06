import { createContainer } from "./main/container";
import { env } from "./main/env";
import { dispatchJobsOperation, dispatchOutboxOperation } from "./main/use-cases";

const container = createContainer(env);
const dispatchOutboxBatch = dispatchOutboxOperation(container, env);
const dispatchJobsBatch = dispatchJobsOperation(container);

const state = { running: true };

function stop(signal: string): void {
  container.logger.info("worker stopping", { signal });
  state.running = false;
}

process.on("SIGTERM", () => {
  stop("SIGTERM");
});
process.on("SIGINT", () => {
  stop("SIGINT");
});

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

container.logger.info("worker started", { worker: env.workerName, environment: env.nodeEnv });

function failureMessageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

async function pollOutbox(): Promise<void> {
  let backoffMilliseconds = env.outboxPollMs;
  while (state.running) {
    try {
      const result = await dispatchOutboxBatch(env.outboxBatchSize, env.outboxMaxAttempts);
      if (result.refused) {
        container.logger.error("outbox dispatch refused", { code: result.code });
        return;
      }

      const counts = result.counts;
      if (counts.pulled === 0) {
        await sleep(backoffMilliseconds);
        backoffMilliseconds = Math.min(backoffMilliseconds * 2, env.outboxMaxBackoffMs);
        continue;
      }

      container.logger.info("outbox dispatched", counts);
      backoffMilliseconds = env.outboxPollMs;
    } catch (thrown: unknown) {
      container.logger.error("outbox poll threw", { reason: failureMessageOf(thrown) });
      await sleep(backoffMilliseconds);
      backoffMilliseconds = Math.min(backoffMilliseconds * 2, env.outboxMaxBackoffMs);
    }
  }
}

async function pollJobs(): Promise<void> {
  let backoffMilliseconds = env.jobsPollMs;
  while (state.running) {
    try {
      const result = await dispatchJobsBatch(env.jobsBatchSize);
      if (result.refused) {
        container.logger.error("job queue dispatch refused", { code: result.code });
        return;
      }

      const counts = result.counts;
      if (counts.claimed === 0) {
        await sleep(backoffMilliseconds);
        backoffMilliseconds = Math.min(backoffMilliseconds * 2, env.jobsMaxBackoffMs);
        continue;
      }

      container.logger.info("jobs dispatched", counts);
      backoffMilliseconds = env.jobsPollMs;
    } catch (thrown: unknown) {
      container.logger.error("job queue poll threw", { reason: failureMessageOf(thrown) });
      await sleep(backoffMilliseconds);
      backoffMilliseconds = Math.min(backoffMilliseconds * 2, env.jobsMaxBackoffMs);
    }
  }
}

await Promise.all([pollOutbox(), pollJobs()]);

await container.close();
container.logger.info("worker finished", { worker: env.workerName });
