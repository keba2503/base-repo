import { failureResponse, jsonResponse } from "@/api/failure";
import { requestIdOf } from "@/api/request-id";
import { isErr, type DomainError } from "@base/domain";
import { defaultModuleActivation, isModuleActive, type ModuleActivation } from "../../../../architecture/modules";
import { providerCallbackActor } from "./actor";
import { recordProviderPaymentEventOperation, sharedContainer } from "./use-cases";

const stripeSignatureHeader = "stripe-signature";
const maxWebhookBodyBytes = 1024 * 1024;

const statusByErrorKind: Readonly<Record<DomainError["kind"], 403 | 404 | 409 | 422 | 503>> = {
  invariantViolation: 422,
  notFound: 404,
  conflict: 409,
  forbidden: 403,
  unavailable: 503,
};

function bodyTooLargeResponse(requestId: string): Response {
  return failureResponse(
    {
      status: 422,
      code: "billing.webhook.bodyTooLarge",
      message: "The request body exceeds the maximum accepted size",
    },
    requestId,
  );
}

export async function stripeWebhookHandler(
  request: Request,
  modules: ModuleActivation = defaultModuleActivation,
): Promise<Response> {
  if (!isModuleActive("billing", modules)) {
    return new Response(null, { status: 404 });
  }

  const requestId = requestIdOf(request);
  const container = sharedContainer();
  const span = container.telemetry.startSpan("billing.webhook", {
    requestId,
    method: request.method,
    path: "/api/billing/stripe/webhook",
  });

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxWebhookBodyBytes) {
      span.setAttribute("statusCode", 422);
      span.end("error");
      return bodyTooLargeResponse(requestId);
    }

    const actor = providerCallbackActor();
    span.setAttribute("tenantId", actor.tenantId);
    span.setAttribute("subjectId", actor.subjectId);
    span.setAttribute("actorKind", actor.kind);

    const recordProviderPaymentEvent = recordProviderPaymentEventOperation();
    const result = await recordProviderPaymentEvent({
      actor,
      notification: {
        rawBody,
        signature: request.headers.get(stripeSignatureHeader) ?? "",
        receivedAt: container.clock.now(),
      },
    });

    if (isErr(result)) {
      const status = statusByErrorKind[result.error.kind];
      span.setAttribute("statusCode", status);
      span.end("error");
      return failureResponse({ status, code: result.error.code, message: result.error.message }, requestId);
    }

    span.setAttribute("statusCode", 200);
    span.setAttribute("eventKind", result.value.kind);
    span.setAttribute("applied", result.value.applied);
    span.setAttribute("replayed", result.value.replayed);
    span.end("ok");

    return jsonResponse(200, { received: true });
  } catch (thrown: unknown) {
    span.recordException(thrown instanceof Error ? thrown : new Error(String(thrown)));
    span.end("error");
    throw thrown;
  }
}

export function handleStripeWebhook(request: Request): Promise<Response> {
  return stripeWebhookHandler(request);
}
