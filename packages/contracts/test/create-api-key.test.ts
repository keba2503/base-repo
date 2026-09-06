import { describe, expect, it } from "bun:test";
import { createApiKeyContract, parseContractInput } from "../src/index";

describe("create api key contract metadata", () => {
  it("requires a session", () => {
    expect(createApiKeyContract.metadata.auth).toBe("session");
  });

  it("does not require a human check", () => {
    expect(createApiKeyContract.metadata.humanCheck).toBe(false);
  });

  it("accepts an idempotency key", () => {
    expect(createApiKeyContract.metadata.idempotent).toBe(true);
  });

  it("declares its rate limit bucket", () => {
    expect(createApiKeyContract.metadata.rateLimit).toBe("apikeys-write");
  });
});

describe("create api key input", () => {
  it("accepts a valid payload", () => {
    const parsed = parseContractInput(createApiKeyContract, { name: "Integration", scopes: ["tenants:read"] });
    expect(parsed).toEqual({ kind: "valid", input: { name: "Integration", scopes: ["tenants:read"] } });
  });

  it("trims the name", () => {
    const parsed = parseContractInput(createApiKeyContract, { name: "  Integration ", scopes: ["tenants:read"] });
    if (parsed.kind !== "valid") throw new Error("Expected a valid payload");
    expect(parsed.input.name).toBe("Integration");
  });

  it("rejects an unknown scope", () => {
    const parsed = parseContractInput(createApiKeyContract, { name: "Integration", scopes: ["tenants:destroy"] });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["scopes.0"]);
  });

  it("rejects an empty scope list", () => {
    const parsed = parseContractInput(createApiKeyContract, { name: "Integration", scopes: [] });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["scopes"]);
  });

  it("rejects a missing name", () => {
    const parsed = parseContractInput(createApiKeyContract, { scopes: ["tenants:read"] });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["name"]);
  });
});

describe("create api key output", () => {
  it("allows only the declared fields", () => {
    const parsed = createApiKeyContract.output.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Integration",
      keyPrefix: "ak_00000000000040008000000000000001",
      scopes: ["tenants:read"],
      createdAt: "2026-01-15T10:00:00.000Z",
      plaintextKey: "ak_00000000000040008000000000000001.secret",
      keyHash: "leaked",
    });
    if (!parsed.success) throw new Error("Expected a valid output");
    expect(Object.keys(parsed.data).sort()).toEqual(["createdAt", "id", "keyPrefix", "name", "plaintextKey", "scopes"]);
  });
});
