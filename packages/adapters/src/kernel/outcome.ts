import type { DomainError, DomainErrorKind } from "@base/domain";
import type { ContractIssue } from "@base/contracts";

export type OutcomeKind = "ok" | "invalid" | "forbidden" | "conflict" | "notFound";

export type Outcome<Value> =
  | { readonly kind: "ok"; readonly value: Value }
  | { readonly kind: "invalid"; readonly issues: readonly ContractIssue[] }
  | { readonly kind: "forbidden"; readonly code: string; readonly message: string }
  | { readonly kind: "conflict"; readonly code: string; readonly message: string }
  | { readonly kind: "notFound"; readonly code: string; readonly message: string };

const failureKindByErrorKind: Readonly<Record<DomainErrorKind, Exclude<OutcomeKind, "ok">>> = {
  invariantViolation: "invalid",
  forbidden: "forbidden",
  conflict: "conflict",
  notFound: "notFound",
};

export function succeeded<Value>(value: Value): Outcome<Value> {
  return { kind: "ok", value };
}

export function invalid<Value>(issues: readonly ContractIssue[]): Outcome<Value> {
  return { kind: "invalid", issues };
}

export function failed<Value>(error: DomainError): Outcome<Value> {
  const kind = failureKindByErrorKind[error.kind];
  if (kind === "invalid") {
    return invalid([{ path: "", code: error.code, message: error.message }]);
  }
  return { kind, code: error.code, message: error.message };
}
