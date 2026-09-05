import { describe, expect, it } from "bun:test";
import type { IdentityProvider, VerifiedSession } from "@base/application";
import { isErr, isOk } from "@base/domain";

export type IssuedSession = VerifiedSession & {
  readonly token: string;
};

export type IdentityProviderHarness = {
  readonly provider: IdentityProvider;
  issueSession(): Promise<IssuedSession>;
};

export function describeIdentityProviderContract(
  name: string,
  createHarness: () => IdentityProviderHarness,
): void {
  describe(`${name} satisfies the IdentityProvider contract`, () => {
    it("resolves a valid token to its subject", async () => {
      const harness = createHarness();
      const issued = await harness.issueSession();
      const result = await harness.provider.verifySession({ token: issued.token });
      if (!isOk(result)) throw new Error(`Expected a session, received ${result.error.code}`);
      expect(result.value).toEqual({ subjectId: issued.subjectId, email: issued.email });
    });

    it("refuses an empty token with a forbidden error", async () => {
      const harness = createHarness();
      const result = await harness.provider.verifySession({ token: "" });
      if (!isErr(result)) throw new Error("Expected a failure");
      expect(result.error.kind).toBe("forbidden");
    });

    it("refuses a token it never issued", async () => {
      const harness = createHarness();
      const result = await harness.provider.verifySession({ token: "forged.token.value" });
      if (!isErr(result)) throw new Error("Expected a failure");
      expect(result.error.kind).toBe("forbidden");
    });

    it("refuses a tampered token", async () => {
      const harness = createHarness();
      const issued = await harness.issueSession();
      const result = await harness.provider.verifySession({ token: `${issued.token}x` });
      if (!isErr(result)) throw new Error("Expected a failure");
      expect(result.error.kind).toBe("forbidden");
    });
  });
}
