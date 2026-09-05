import type { ZodType } from "zod";

export type ContractAuth = "session" | "apiKey" | "either" | "public";

export type ContractMetadata = {
  readonly auth: ContractAuth;
  readonly humanCheck: boolean;
  readonly idempotent: boolean;
  readonly rateLimit: string;
};

export type Contract<Input, Output> = {
  readonly name: string;
  readonly input: ZodType<Input>;
  readonly output: ZodType<Output>;
  readonly errorCodes: readonly string[];
  readonly metadata: ContractMetadata;
};

export type ContractInput<Declared> = Declared extends Contract<infer Input, unknown> ? Input : never;

export type ContractOutput<Declared> = Declared extends Contract<never, infer Output> ? Output : never;

export type ContractIssue = {
  readonly path: string;
  readonly code: string;
  readonly message: string;
};

export type ContractParse<Input> =
  | { readonly kind: "valid"; readonly input: Input }
  | { readonly kind: "invalid"; readonly issues: readonly ContractIssue[] };

export function parseContractInput<Input, Output>(
  contract: Contract<Input, Output>,
  payload: unknown,
): ContractParse<Input> {
  const parsed = contract.input.safeParse(payload);
  if (parsed.success) return { kind: "valid", input: parsed.data };
  return {
    kind: "invalid",
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.map((segment) => String(segment)).join("."),
      code: issue.code,
      message: issue.message,
    })),
  };
}
