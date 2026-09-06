import type { Outcome } from "@base/adapters";
import { envelopeOf, type ApiFailure, type ErrorStatus } from "./failure";
import type { IdempotentReply } from "./ports";
import type { SuccessStatus } from "./route-definition";

const statusByFailureKind: Readonly<Record<"forbidden" | "conflict" | "notFound" | "unavailable", ErrorStatus>> = {
  forbidden: 403,
  conflict: 409,
  notFound: 404,
  unavailable: 503,
};

function failureOf(outcome: Exclude<Outcome<unknown>, { kind: "ok" }>): ApiFailure {
  if (outcome.kind === "invalid") {
    const single = outcome.issues.length === 1 ? outcome.issues[0] : undefined;
    const isDomainRule = single !== undefined && single.path === "";
    return {
      status: 422,
      code: isDomainRule ? single.code : "request.invalid",
      message: isDomainRule ? single.message : "The request does not satisfy the contract",
      issues: outcome.issues,
    };
  }
  return { status: statusByFailureKind[outcome.kind], code: outcome.code, message: outcome.message };
}

export function replyOf(outcome: Outcome<unknown>, successStatus: SuccessStatus, requestId: string): IdempotentReply {
  if (outcome.kind === "ok") {
    return { status: successStatus, body: JSON.stringify(outcome.value) };
  }
  return { status: failureOf(outcome).status, body: JSON.stringify(envelopeOf(failureOf(outcome), requestId)) };
}
