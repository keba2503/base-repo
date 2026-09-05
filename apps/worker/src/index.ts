import { createContainer } from "./main/container";
import { env } from "./main/env";

const container = createContainer(env);

container.logger.info("worker started", {
  worker: env.workerName,
  environment: env.nodeEnv,
  startedAt: container.clock.now().toISOString(),
});

container.logger.info("worker finished", { worker: env.workerName });
