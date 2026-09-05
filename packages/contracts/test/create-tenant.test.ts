import { describe, expect, it } from "bun:test";
import { createTenantContract, parseContractInput } from "../src/index";

describe("create tenant contract metadata", () => {
  it("requires a session", () => {
    expect(createTenantContract.metadata.auth).toBe("session");
  });

  it("does not require a human check", () => {
    expect(createTenantContract.metadata.humanCheck).toBe(false);
  });

  it("accepts an idempotency key", () => {
    expect(createTenantContract.metadata.idempotent).toBe(true);
  });

  it("declares its rate limit bucket", () => {
    expect(createTenantContract.metadata.rateLimit).toBe("tenants-write");
  });
});

describe("create tenant input", () => {
  it("accepts a valid payload", () => {
    const parsed = parseContractInput(createTenantContract, { name: "Acme Clinic", slug: "acme-clinic" });
    expect(parsed).toEqual({ kind: "valid", input: { name: "Acme Clinic", slug: "acme-clinic" } });
  });

  it("trims the name", () => {
    const parsed = parseContractInput(createTenantContract, { name: "  Acme Clinic  ", slug: "acme-clinic" });
    if (parsed.kind !== "valid") throw new Error("Expected a valid payload");
    expect(parsed.input.name).toBe("Acme Clinic");
  });

  it("rejects an uppercase slug", () => {
    const parsed = parseContractInput(createTenantContract, { name: "Acme Clinic", slug: "Acme" });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["slug"]);
  });

  it("rejects a missing name", () => {
    const parsed = parseContractInput(createTenantContract, { slug: "acme-clinic" });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["name"]);
  });

  it("rejects a payload that is not an object", () => {
    expect(parseContractInput(createTenantContract, null).kind).toBe("invalid");
  });
});

describe("create tenant output", () => {
  it("allows only the declared fields", () => {
    const parsed = createTenantContract.output.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Acme Clinic",
      slug: "acme-clinic",
      createdAt: "2026-01-15T10:00:00.000Z",
      secret: "leaked",
    });
    if (!parsed.success) throw new Error("Expected a valid output");
    expect(Object.keys(parsed.data).sort()).toEqual(["createdAt", "id", "name", "slug"]);
  });
});
