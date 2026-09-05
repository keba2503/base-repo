import type { HumanVerification, HumanVerificationRequest, HumanVerifier } from "@base/application";

export class InMemoryHumanVerifier implements HumanVerifier {
  readonly #recognised: ReadonlySet<string>;
  readonly requests: HumanVerificationRequest[] = [];

  constructor(recognisedTokens: readonly string[]) {
    this.#recognised = new Set(recognisedTokens);
  }

  verify(request: HumanVerificationRequest): Promise<HumanVerification> {
    this.requests.push(request);
    if (request.token.length === 0) {
      return Promise.resolve({ kind: "rejected", reason: "token.missing" });
    }
    if (!this.#recognised.has(request.token)) {
      return Promise.resolve({ kind: "rejected", reason: "token.unrecognised" });
    }
    return Promise.resolve({ kind: "human" });
  }
}
