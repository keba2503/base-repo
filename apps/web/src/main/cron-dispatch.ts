import { cronBearerTokenOf, cronSecretsMatch } from "@/api/cron-secret";
import { failureResponse, jsonResponse } from "@/api/failure";
import { remoteAddressOf, requestIdOf } from "@/api/request-id";
import { cronActor } from "./actor";
import { env } from "./env";
import { dispatchJobsOperation, dispatchOutboxOperation, sharedContainer } from "./use-cases";

let warnedAboutMissingSecret = false;

function authorized(request: Request, warn: (message: string) => void): boolean {
  const secret = env.cronSecret;
  if (secret === undefined) {
    if (!warnedAboutMissingSecret) {
      warnedAboutMissingSecret = true;
      warn("CRON_SECRET is not configured: every cron dispatch call is rejected until it is set");
    }
    return false;
  }
  const provided = cronBearerTokenOf(request.headers.get("authorization"));
  if (provided === undefined) return false;
  return cronSecretsMatch(secret, provided);
}

export async function handleCronDispatch(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);
  const container = sharedContainer();
  const span = container.telemetry.startSpan("cron.dispatch", {
    requestId,
    method: request.method,
    path: "/api/cron/dispatch",
  });

  try {
    if (!authorized(request, (message) => container.logger.warn(message))) {
      container.logger.warn("cron dispatch rejected an unauthenticated call", {
        requestId,
        remoteAddress: remoteAddressOf(request),
      });
      span.setAttribute("statusCode", 401);
      span.end("error");
      return failureResponse(
        { status: 401, code: "cron.unauthorized", message: "This operation requires a valid cron secret" },
        requestId,
      );
    }

    const actor = cronActor();
    span.setAttribute("tenantId", actor.tenantId);
    span.setAttribute("subjectId", actor.subjectId);
    span.setAttribute("actorKind", actor.kind);

    const outboxBatch = dispatchOutboxOperation();
    const jobsBatch = dispatchJobsOperation();

    const outbox = await outboxBatch(actor, env.cronDispatchOutboxBatchSize, env.cronDispatchOutboxMaxAttempts);
    if (outbox.refused) {
      container.logger.error("cron dispatch of the outbox was refused", { requestId, code: outbox.code });
      span.setAttribute("statusCode", 500);
      span.setAttribute("outboxRefusedCode", outbox.code);
      span.end("error");
      return failureResponse(
        { status: 500, code: "cron.outboxRefused", message: `The outbox dispatch was refused: ${outbox.code}` },
        requestId,
      );
    }

    const jobs = await jobsBatch(actor, env.cronDispatchJobsBatchSize);
    if (jobs.refused) {
      container.logger.error("cron dispatch of the job queue was refused", { requestId, code: jobs.code });
      span.setAttribute("statusCode", 500);
      span.setAttribute("jobsRefusedCode", jobs.code);
      span.end("error");
      return failureResponse(
        { status: 500, code: "cron.jobsRefused", message: `The job queue dispatch was refused: ${jobs.code}` },
        requestId,
      );
    }

    const hasMoreWork =
      outbox.counts.pulled >= env.cronDispatchOutboxBatchSize || jobs.counts.claimed >= env.cronDispatchJobsBatchSize;

    span.setAttribute("statusCode", 200);
    span.setAttribute("outboxPulled", outbox.counts.pulled);
    span.setAttribute("outboxPublished", outbox.counts.published);
    span.setAttribute("outboxFailed", outbox.counts.failed);
    span.setAttribute("outboxUnhandled", outbox.counts.unhandled);
    span.setAttribute("outboxAbandoned", outbox.counts.abandoned);
    span.setAttribute("jobsClaimed", jobs.counts.claimed);
    span.setAttribute("jobsCompleted", jobs.counts.completed);
    span.setAttribute("jobsFailed", jobs.counts.failed);
    span.setAttribute("jobsUnhandled", jobs.counts.unhandled);
    span.setAttribute("jobsExhausted", jobs.counts.exhausted);
    span.setAttribute("hasMoreWork", hasMoreWork);
    span.end("ok");

    container.logger.info("cron dispatch completed", {
      requestId,
      outbox: outbox.counts,
      jobs: jobs.counts,
      hasMoreWork,
    });

    return jsonResponse(200, { outbox: outbox.counts, jobs: jobs.counts, hasMoreWork });
  } catch (thrown: unknown) {
    span.recordException(thrown instanceof Error ? thrown : new Error(String(thrown)));
    span.end("error");
    throw thrown;
  }
}
