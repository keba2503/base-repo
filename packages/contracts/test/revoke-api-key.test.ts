import { describe, expect, it } from "bun:test";
import { parseContractInput, revokeApiKeyContract } from "../src/index";

describe("revoke api key contract metadata", () => {
  it("requires a session", () => {
    expect(revokeApiKeyContract.metadata.auth).toBe("session");
  });

  it("does not require a human check", () => {
    expect(revokeApiKeyContract.metadata.humanCheck).toBe(false);
  });

  it("accepts an idempotency key", () => {
    expect(revokeApiKeyContract.metadata.idempotent).toBe(true);
  });

  it("shares the write bucket of api keys", () => {
    expect(revokeApiKeyContract.metadata.rateLimit).toBe("apikeys-write");
  });
});

describe("revoke api key input", () => {
  it("accepts a uuid", () => {
    const parsed = parseContractInput(revokeApiKeyContract, { apiKeyId: "00000000-0000-4000-8000-000000000001" });
    expect(parsed.kind).toBe("valid");
  });

  it("rejects a value that is not a uuid", () => {
    const parsed = parseContractInput(revokeApiKeyContract, { apiKeyId: "nope" });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["apiKeyId"]);
  });
});

describe("revoke api key output", () => {
  it("never carries the plaintext key", () => {
    const parsed = revokeApiKeyContract.output.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Integration",
      keyPrefix: "ak_00000000000040008000000000000001",
      scopes: ["tenants:read"],
      createdAt: "2026-01-15T10:00:00.000Z",
      revokedAt: "2026-02-01T00:00:00.000Z",
      plaintextKey: "leaked",
    });
    if (!parsed.success) throw new Error("Expected a valid output");
    expect(Object.keys(parsed.data).sort()).toEqual(["createdAt", "id", "keyPrefix", "name", "revokedAt", "scopes"]);
  });
});
