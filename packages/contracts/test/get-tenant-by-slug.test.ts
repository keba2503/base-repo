import { describe, expect, it } from "bun:test";
import { getTenantBySlugContract, parseContractInput } from "../src/index";

describe("get tenant by slug contract metadata", () => {
  it("accepts a session or an api key", () => {
    expect(getTenantBySlugContract.metadata.auth).toBe("either");
  });

  it("does not require a human check", () => {
    expect(getTenantBySlugContract.metadata.humanCheck).toBe(false);
  });

  it("is not idempotent by key because it never writes", () => {
    expect(getTenantBySlugContract.metadata.idempotent).toBe(false);
  });

  it("declares its rate limit bucket", () => {
    expect(getTenantBySlugContract.metadata.rateLimit).toBe("tenants-read");
  });
});

describe("get tenant by slug input", () => {
  it("accepts a valid slug", () => {
    expect(parseContractInput(getTenantBySlugContract, { slug: "acme-clinic" })).toEqual({
      kind: "valid",
      input: { slug: "acme-clinic" },
    });
  });

  it("rejects a slug with uppercase letters", () => {
    const parsed = parseContractInput(getTenantBySlugContract, { slug: "Acme" });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["slug"]);
  });

  it("rejects a missing slug", () => {
    expect(parseContractInput(getTenantBySlugContract, {}).kind).toBe("invalid");
  });
});

describe("get tenant by slug output", () => {
  it("allows only the declared fields", () => {
    const parsed = getTenantBySlugContract.output.safeParse({
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
