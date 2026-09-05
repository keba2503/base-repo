import { describe, expect, it } from "bun:test";
import type { HumanVerifier } from "@base/application";

export type HumanVerifierHarness = {
  readonly verifier: HumanVerifier;
  readonly recognisedToken: string | undefined;
  readonly unrecognisedToken: string;
};

export function describeHumanVerifierContract(
  name: string,
  createHarness: () => HumanVerifierHarness,
): void {
  const probe = createHarness();

  describe(`${name} satisfies the HumanVerifier contract`, () => {
    it("rejects an empty token without asking the provider", async () => {
      const harness = createHarness();
      const verification = await harness.verifier.verify({ token: "" });
      expect(verification.kind).toBe("rejected");
    });

    it("rejects a token it does not recognise", async () => {
      const harness = createHarness();
      const verification = await harness.verifier.verify({ token: harness.unrecognisedToken });
      expect(verification.kind).toBe("rejected");
    });

    it("names a reason when it rejects", async () => {
      const harness = createHarness();
      const verification = await harness.verifier.verify({ token: harness.unrecognisedToken });
      if (verification.kind !== "rejected") throw new Error("Expected a rejection");
      expect(verification.reason.length).toBeGreaterThan(0);
    });

    it.skipIf(probe.recognisedToken === undefined)("accepts a token it recognises", async () => {
      const harness = createHarness();
      const verification = await harness.verifier.verify({ token: harness.recognisedToken ?? "" });
      expect(verification).toEqual({ kind: "human" });
    });
  });
}
