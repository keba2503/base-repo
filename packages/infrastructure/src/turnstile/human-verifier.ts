import type { HumanVerification, HumanVerificationRequest, HumanVerifier } from "@base/application";
import type { TurnstileClient } from "./turnstile-client";

export class TurnstileHumanVerifier implements HumanVerifier {
  readonly #client: TurnstileClient;

  constructor(client: TurnstileClient) {
    this.#client = client;
  }

  async verify(request: HumanVerificationRequest): Promise<HumanVerification> {
    if (request.token.length === 0) {
      return { kind: "rejected", reason: "token.missing" };
    }
    try {
      const verdict = await this.#client.siteverify(request);
      if (verdict.success) return { kind: "human" };
      return { kind: "rejected", reason: verdict.errorCodes[0] ?? "token.unrecognised" };
    } catch {
      return { kind: "rejected", reason: "provider.unavailable" };
    }
  }
}
