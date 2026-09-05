export type Ok<Value> = { readonly kind: "ok"; readonly value: Value };

export type Err<Error> = { readonly kind: "err"; readonly error: Error };

export type Result<Value, Error> = Ok<Value> | Err<Error>;

export function ok<Value>(value: Value): Ok<Value> {
  return { kind: "ok", value };
}

export function err<Error>(error: Error): Err<Error> {
  return { kind: "err", error };
}

export function isOk<Value, Error>(result: Result<Value, Error>): result is Ok<Value> {
  return result.kind === "ok";
}

export function isErr<Value, Error>(result: Result<Value, Error>): result is Err<Error> {
  return result.kind === "err";
}

export function map<Value, Error, Mapped>(
  result: Result<Value, Error>,
  transform: (value: Value) => Mapped,
): Result<Mapped, Error> {
  return isOk(result) ? ok(transform(result.value)) : result;
}

export function andThen<Value, Error, Next>(
  result: Result<Value, Error>,
  next: (value: Value) => Result<Next, Error>,
): Result<Next, Error> {
  return isOk(result) ? next(result.value) : result;
}
