import type { Context } from "hono";
import { authenticate, credentialOf, rateLimitSubjectOf } from "./auth";
import type { ApiDependencies } from "./dependencies";
import { failure, failureResponse, jsonContentType, type ApiFailure } from "./failure";
import { humanTokenHeader, verifyHuman } from "./human-check";
import { idempotencyKeyHeader, idempotencyReplayedHeader, lookupIdempotency } from "./idempotency";
import { replyOf } from "./outcome-response";
import type { IdempotentReply } from "./ports";
import { enforceRateLimit } from "./rate-limit";
import { remoteAddressOf } from "./request-id";
import type { RouteDefinition } from "./route-definition";

export type ApiEnvironment = {
  Variables: {
    requestId: string;
  };
};

type Payload =
  | { readonly kind: "parsed"; readonly payload: unknown; readonly rawBody: string }
  | { readonly kind: "refused"; readonly reason: ApiFailure };

async function payloadOf(route: RouteDefinition, context: Context<ApiEnvironment>): Promise<Payload> {
  if (route.inputLocation === "path") {
    return { kind: "parsed", payload: context.req.param(), rawBody: "" };
  }
  if (route.inputLocation === "query") {
    return { kind: "parsed", payload: context.req.query(), rawBody: "" };
  }
  const rawBody = await context.req.text();
  if (rawBody.trim().length === 0) return { kind: "parsed", payload: undefined, rawBody };
  try {
    return { kind: "parsed", payload: JSON.parse(rawBody), rawBody };
  } catch {
    return { kind: "refused", reason: failure(422, "request.malformedJson", "The request body is not valid JSON") };
  }
}

function replyResponse(reply: IdempotentReply, headers: Readonly<Record<string, string>>): Response {
  return new Response(reply.body, {
    status: reply.status,
    headers: { "content-type": jsonContentType, ...headers },
  });
}

export function routeHandler(route: RouteDefinition, dependencies: ApiDependencies) {
  const { metadata } = route.contract;
  const usesIdempotency = metadata.idempotent && route.inputLocation === "body";

  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const requestId = context.get("requestId");
    const request = context.req.raw;
    const remoteAddress = remoteAddressOf(request);
    const credential = credentialOf(request, remoteAddress);

    const span = dependencies.telemetry.startSpan("http.request", {
      requestId,
      operationId: route.operationId,
      method: request.method,
      path: context.req.path,
    });

    try {
      const rateLimit = await enforceRateLimit({
        limiter: dependencies.rateLimiter,
        policies: dependencies.rateLimits,
        bucket: metadata.rateLimit,
        subject: await rateLimitSubjectOf(credential),
      });
      if (rateLimit.kind === "limited") {
        span.setAttribute("statusCode", 429);
        span.end("error");
        return failureResponse(rateLimit.reason, requestId);
      }
      const responseHeaders = rateLimit.headers;

      const authentication = await authenticate({ auth: metadata.auth, credential, resolveActor: dependencies.resolveActor });
      if (authentication.kind === "refused") {
        span.setAttribute("statusCode", authentication.reason.status);
        span.end("error");
        return failureResponse({ ...authentication.reason, headers: responseHeaders }, requestId);
      }
      const { actor } = authentication;
      span.setAttribute("tenantId", actor.tenantId);
      span.setAttribute("subjectId", actor.subjectId);
      span.setAttribute("actorKind", actor.kind);

      if (metadata.humanCheck) {
        const rejected = await verifyHuman({
          token: request.headers.get(humanTokenHeader) ?? undefined,
          remoteAddress,
          verifier: dependencies.humanVerifier,
          logger: dependencies.logger,
          requestId,
        });
        if (rejected) {
          span.setAttribute("statusCode", rejected.status);
          span.end("error");
          return failureResponse({ ...rejected, headers: responseHeaders }, requestId);
        }
      }

      const payload = await payloadOf(route, context);
      if (payload.kind === "refused") {
        span.setAttribute("statusCode", payload.reason.status);
        span.end("error");
        return failureResponse({ ...payload.reason, headers: responseHeaders }, requestId);
      }

      const idempotency = usesIdempotency
        ? await lookupIdempotency({
            key: request.headers.get(idempotencyKeyHeader) ?? undefined,
            operationId: route.operationId,
            actor,
            rawBody: payload.rawBody,
            store: dependencies.idempotencyStore,
          })
        : { kind: "notRequested" as const };
      if (idempotency.kind === "refused") {
        span.setAttribute("statusCode", idempotency.reason.status);
        span.end("error");
        return failureResponse({ ...idempotency.reason, headers: responseHeaders }, requestId);
      }
      if (idempotency.kind === "replay") {
        span.setAttribute("statusCode", idempotency.reply.status);
        span.setAttribute("idempotencyReplay", true);
        span.end("ok");
        return replyResponse(idempotency.reply, { ...responseHeaders, [idempotencyReplayedHeader]: "true" });
      }

      const outcome = await route.execute({ actor, payload: payload.payload });
      const reply = replyOf(outcome, route.successStatus, requestId);
      if (idempotency.kind === "fresh") await dependencies.idempotencyStore.save(idempotency.record(reply));

      span.setAttribute("statusCode", reply.status);
      span.end(reply.status < 500 ? "ok" : "error");
      return replyResponse(reply, responseHeaders);
    } catch (thrown: unknown) {
      span.recordException(thrown instanceof Error ? thrown : new Error(String(thrown)));
      span.end("error");
      throw thrown;
    }
  };
}
