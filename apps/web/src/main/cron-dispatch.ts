import { cronBearerTokenOf, cronSecretsMatch } from "@/api/cron-secret";
import { failureResponse, jsonResponse } from "@/api/failure";
import { remoteAddressOf, requestIdOf } from "@/api/request-id";
import { cronActor } from "./actor";
import { env } from "./env";
import { dispatchJobsOperation, dispatchOutboxOperation, sharedContainer } from "./use-cases";

function authorized(request: Request): boolean {
  const secret = env.cronSecret;
  if (secret === undefined) return env.nodeEnv !== "production";
  const provided = cronBearerTokenOf(request.headers.get("authorization"));
  if (provided === undefined) return false;
  return cronSecretsMatch(secret, provided);
}

export async function handleCronDispatch(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);
  const container = sharedContainer();

  if (!authorized(request)) {
    container.logger.warn("cron dispatch rejected an unauthenticated call", {
      requestId,
      remoteAddress: remoteAddressOf(request),
    });
    return failureResponse(
      { status: 401, code: "cron.unauthorized", message: "This operation requires a valid cron secret" },
      requestId,
    );
  }

  const outboxBatch = dispatchOutboxOperation();
  const jobsBatch = dispatchJobsOperation();
  const actor = cronActor();

  const outbox = await outboxBatch(actor, env.cronDispatchOutboxBatchSize, env.cronDispatchOutboxMaxAttempts);
  if (outbox.refused) {
    container.logger.error("cron dispatch of the outbox was refused", { requestId, code: outbox.code });
    return failureResponse(
      { status: 500, code: "cron.outboxRefused", message: `The outbox dispatch was refused: ${outbox.code}` },
      requestId,
    );
  }

  const jobs = await jobsBatch(actor, env.cronDispatchJobsBatchSize);
  if (jobs.refused) {
    container.logger.error("cron dispatch of the job queue was refused", { requestId, code: jobs.code });
    return failureResponse(
      { status: 500, code: "cron.jobsRefused", message: `The job queue dispatch was refused: ${jobs.code}` },
      requestId,
    );
  }

  const hasMoreWork =
    outbox.counts.pulled >= env.cronDispatchOutboxBatchSize || jobs.counts.claimed >= env.cronDispatchJobsBatchSize;

  container.logger.info("cron dispatch completed", { requestId, outbox: outbox.counts, jobs: jobs.counts, hasMoreWork });

  return jsonResponse(200, { outbox: outbox.counts, jobs: jobs.counts, hasMoreWork });
}
