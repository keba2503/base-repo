import { describe, expect, it } from "bun:test";
import { isErr, isOk } from "../src/kernel/result";
import { Tenant, tenantFieldClassifications } from "../src/tenants/tenant";
import { tenantSnapshotFactory } from "./factories/tenant";

function createFailureCode(snapshot: Parameters<typeof Tenant.create>[0]): string {
  const result = Tenant.create(snapshot);
  if (isOk(result)) throw new Error("Expected the tenant to be rejected");
  return result.error.code;
}

describe("tenant creation", () => {
  it("accepts a valid tenant", () => {
    expect(isOk(Tenant.create(tenantSnapshotFactory()))).toBe(true);
  });

  it("trims the name before storing it", () => {
    const result = Tenant.create(tenantSnapshotFactory({ name: "  Acme Clinic  " }));
    if (!isOk(result)) throw new Error("Expected the tenant to be accepted");
    expect(result.value.name).toBe("Acme Clinic");
  });

  it("records a creation event", () => {
    const result = Tenant.create(tenantSnapshotFactory());
    if (!isOk(result)) throw new Error("Expected the tenant to be accepted");
    expect(result.value.pullEvents()).toEqual([
      {
        name: "tenant.created",
        tenantId: result.value.id,
        occurredAt: result.value.createdAt,
        payload: { tenantId: result.value.id, slug: "acme-clinic" },
      },
    ]);
  });

  it("empties the event buffer once pulled", () => {
    const result = Tenant.create(tenantSnapshotFactory());
    if (!isOk(result)) throw new Error("Expected the tenant to be accepted");
    result.value.pullEvents();
    expect(result.value.pullEvents()).toEqual([]);
  });
});

describe("tenant name invariants", () => {
  it("rejects a name shorter than two characters", () => {
    expect(createFailureCode(tenantSnapshotFactory({ name: "a" }))).toBe("tenant.name.length");
  });

  it("rejects a name longer than eighty characters", () => {
    expect(createFailureCode(tenantSnapshotFactory({ name: "a".repeat(81) }))).toBe("tenant.name.length");
  });

  it("accepts a name of exactly eighty characters", () => {
    expect(isOk(Tenant.create(tenantSnapshotFactory({ name: "a".repeat(80) })))).toBe(true);
  });
});

describe("tenant slug invariants", () => {
  it("rejects a slug shorter than three characters", () => {
    expect(createFailureCode(tenantSnapshotFactory({ slug: "ab" }))).toBe("tenant.slug.length");
  });

  it("rejects a slug longer than forty characters", () => {
    expect(createFailureCode(tenantSnapshotFactory({ slug: "a".repeat(41) }))).toBe("tenant.slug.length");
  });

  it("rejects uppercase letters", () => {
    expect(createFailureCode(tenantSnapshotFactory({ slug: "Acme" }))).toBe("tenant.slug.format");
  });

  it("rejects a leading hyphen", () => {
    expect(createFailureCode(tenantSnapshotFactory({ slug: "-acme" }))).toBe("tenant.slug.format");
  });

  it("rejects consecutive hyphens", () => {
    expect(createFailureCode(tenantSnapshotFactory({ slug: "acme--clinic" }))).toBe("tenant.slug.format");
  });

  it("accepts digits and single hyphens", () => {
    expect(isOk(Tenant.create(tenantSnapshotFactory({ slug: "acme-2-clinic" })))).toBe(true);
  });
});

describe("tenant restoration", () => {
  it("does not record an event", () => {
    const result = Tenant.restore(tenantSnapshotFactory());
    if (!isOk(result)) throw new Error("Expected the tenant to be accepted");
    expect(result.value.pullEvents()).toEqual([]);
  });

  it("applies the same invariants as creation", () => {
    expect(isErr(Tenant.restore(tenantSnapshotFactory({ slug: "NO" })))).toBe(true);
  });
});

describe("tenant data classification", () => {
  it("declares the name as personal data", () => {
    expect(tenantFieldClassifications.name).toBe("personal");
  });
});
