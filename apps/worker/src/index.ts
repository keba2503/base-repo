import { createContainer } from "./main/container";
import { env } from "./main/env";
import { dispatchOutboxOperation } from "./main/use-cases";

const container = createContainer(env);
const dispatch = dispatchOutboxOperation(container, env);

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

let backoffMilliseconds = env.outboxPollMs;

while (state.running) {
  const result = await dispatch(env.outboxBatchSize, env.outboxMaxAttempts);
  if (result.refused) {
    container.logger.error("outbox dispatch refused", { code: result.code });
    break;
  }

  const counts = result.counts;
  if (counts.pulled === 0) {
    await sleep(backoffMilliseconds);
    backoffMilliseconds = Math.min(backoffMilliseconds * 2, env.outboxMaxBackoffMs);
    continue;
  }

  container.logger.info("outbox dispatched", counts);
  backoffMilliseconds = env.outboxPollMs;
}

await container.close();
container.logger.info("worker finished", { worker: env.workerName });
