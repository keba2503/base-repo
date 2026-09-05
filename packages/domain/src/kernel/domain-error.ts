export type DomainErrorKind = "invariantViolation" | "notFound" | "conflict" | "forbidden";

export type DomainError = {
  readonly kind: DomainErrorKind;
  readonly code: string;
  readonly message: string;
};

export function invariantViolation(code: string, message: string): DomainError {
  return { kind: "invariantViolation", code, message };
}

export function notFound(code: string, message: string): DomainError {
  return { kind: "notFound", code, message };
}

export function conflict(code: string, message: string): DomainError {
  return { kind: "conflict", code, message };
}

export function forbidden(code: string, message: string): DomainError {
  return { kind: "forbidden", code, message };
}
