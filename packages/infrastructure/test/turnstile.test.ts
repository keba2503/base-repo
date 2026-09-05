import { describe, expect, it } from "bun:test";
import {
  createTurnstileClient,
  TurnstileHumanVerifier,
  type FetchImplementation,
  type TurnstileVerdict,
} from "@base/infrastructure";
import { describeHumanVerifierContract } from "./contracts/index";

const secret = process.env.TURNSTILE_SECRET;
const recognisedToken = process.env.TURNSTILE_RECOGNISED_TOKEN;

if (secret === undefined) {
  console.info(
    "Skipping the TurnstileHumanVerifier contract suite: set TURNSTILE_SECRET to run it against Cloudflare (TURNSTILE_RECOGNISED_TOKEN enables the acceptance case)",
  );
} else {
  describeHumanVerifierContract("TurnstileHumanVerifier", () => ({
    verifier: new TurnstileHumanVerifier(createTurnstileClient({ secret })),
    recognisedToken,
    unrecognisedToken: "not-a-turnstile-token",
  }));
}

function formOf(body: RequestInit["body"]): string {
  return body instanceof URLSearchParams ? body.toString() : "";
}

function fetchReplying(status: number, payload: unknown): { fetchImplementation: FetchImplementation; bodies: string[] } {
  const bodies: string[] = [];
  const fetchImplementation: FetchImplementation = (_input, init) => {
    bodies.push(formOf(init.body));
    return Promise.resolve(new Response(JSON.stringify(payload), { status }));
  };
  return { fetchImplementation, bodies };
}

describe("turnstile client over a recorded transport", () => {
  it("posts the secret, the token and the remote address as a form", async () => {
    const transport = fetchReplying(200, { success: true });
    const client = createTurnstileClient({ secret: "s3cret", fetchImplementation: transport.fetchImplementation });
    await client.siteverify({ token: "tok", remoteAddress: "203.0.113.9" });
    expect(transport.bodies).toEqual(["secret=s3cret&response=tok&remoteip=203.0.113.9"]);
  });

  it("reads a successful verdict", async () => {
    const transport = fetchReplying(200, { success: true });
    const client = createTurnstileClient({ secret: "s3cret", fetchImplementation: transport.fetchImplementation });
    expect(await client.siteverify({ token: "tok" })).toEqual({ success: true, errorCodes: [] });
  });

  it("reads the error codes of a failed verdict", async () => {
    const transport = fetchReplying(200, { success: false, "error-codes": ["invalid-input-response"] });
    const client = createTurnstileClient({ secret: "s3cret", fetchImplementation: transport.fetchImplementation });
    const verdict: TurnstileVerdict = await client.siteverify({ token: "tok" });
    expect(verdict).toEqual({ success: false, errorCodes: ["invalid-input-response"] });
  });

  it("treats a non 2xx answer as a failed verdict", async () => {
    const transport = fetchReplying(503, {});
    const client = createTurnstileClient({ secret: "s3cret", fetchImplementation: transport.fetchImplementation });
    expect((await client.siteverify({ token: "tok" })).success).toBe(false);
  });
});

describe("turnstile human verifier over a recorded transport", () => {
  it("verifies a token the provider accepts", async () => {
    const transport = fetchReplying(200, { success: true });
    const verifier = new TurnstileHumanVerifier(
      createTurnstileClient({ secret: "s3cret", fetchImplementation: transport.fetchImplementation }),
    );
    expect(await verifier.verify({ token: "tok" })).toEqual({ kind: "human" });
  });

  it("reports the provider reason when it rejects", async () => {
    const transport = fetchReplying(200, { success: false, "error-codes": ["timeout-or-duplicate"] });
    const verifier = new TurnstileHumanVerifier(
      createTurnstileClient({ secret: "s3cret", fetchImplementation: transport.fetchImplementation }),
    );
    expect(await verifier.verify({ token: "tok" })).toEqual({ kind: "rejected", reason: "timeout-or-duplicate" });
  });

  it("rejects instead of throwing when the provider is unreachable", async () => {
    const failing: FetchImplementation = () => Promise.reject(new Error("network down"));
    const verifier = new TurnstileHumanVerifier(createTurnstileClient({ secret: "s3cret", fetchImplementation: failing }));
    expect(await verifier.verify({ token: "tok" })).toEqual({ kind: "rejected", reason: "provider.unavailable" });
  });
});

describeHumanVerifierContract("TurnstileHumanVerifier over a recorded transport", () => {
  const recognised = "recorded-valid-token";
  const fetchImplementation: FetchImplementation = (_input, init) => {
    const token = new URLSearchParams(formOf(init.body)).get("response");
    const payload = token === recognised ? { success: true } : { success: false, "error-codes": ["invalid-input-response"] };
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  };
  return {
    verifier: new TurnstileHumanVerifier(createTurnstileClient({ secret: "s3cret", fetchImplementation })),
    recognisedToken: recognised,
    unrecognisedToken: "unknown",
  };
});
