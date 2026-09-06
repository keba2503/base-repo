import type { ContractIssue } from "@base/contracts";

export type ErrorStatus = 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503;

export type ApiFailure = {
  readonly status: ErrorStatus;
  readonly code: string;
  readonly message: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly issues?: readonly ContractIssue[];
};

export type ErrorEnvelope = {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly issues?: readonly ContractIssue[];
  };
};

export function failure(status: ErrorStatus, code: string, message: string): ApiFailure {
  return { status, code, message };
}

export function envelopeOf(reason: ApiFailure, requestId: string): ErrorEnvelope {
  const { code, message, issues } = reason;
  return { error: issues === undefined ? { code, message, requestId } : { code, message, requestId, issues } };
}

export const jsonContentType = "application/json; charset=utf-8";

export function jsonResponse(status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": jsonContentType, ...headers },
  });
}

export function failureResponse(reason: ApiFailure, requestId: string): Response {
  return jsonResponse(reason.status, envelopeOf(reason, requestId), reason.headers ?? {});
}
