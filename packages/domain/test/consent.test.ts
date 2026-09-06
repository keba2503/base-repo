import { describe, expect, it } from "bun:test";
import { Consent, consentFieldClassifications } from "../src/consent/consent";
import { isOk } from "../src/kernel/result";
import { consentFactory, consentSnapshotFactory } from "./factories/consent";

function grantFailureCode(snapshot: Parameters<typeof Consent.grant>[0]): string {
  const result = Consent.grant(snapshot);
  if (isOk(result)) throw new Error("Expected the consent to be rejected");
  return result.error.code;
}

describe("consent grant", () => {
  it("accepts a valid consent", () => {
    expect(isOk(Consent.grant(consentSnapshotFactory()))).toBe(true);
  });

  it("is active right after being granted", () => {
    const consent = consentFactory();
    expect(consent.isActive).toBe(true);
    expect(consent.withdrawnAt).toBeNull();
  });

  it("records a granted event", () => {
    const consent = consentFactory({ id: consentSnapshotFactory().id });
    expect(consent.pullEvents()).toEqual([
      {
        name: "consent.granted",
        tenantId: consent.tenantId,
        occurredAt: consent.grantedAt,
        payload: {
          consentId: consent.id,
          subjectId: consent.subjectId,
          category: consent.category,
          policyVersion: consent.policyVersion,
        },
      },
    ]);
  });

  it("rejects an empty policy version", () => {
    expect(grantFailureCode(consentSnapshotFactory({ policyVersion: "" }))).toBe("consent.policyVersion.empty");
  });

  it("rejects an empty source address", () => {
    expect(grantFailureCode(consentSnapshotFactory({ sourceIpAddress: "" }))).toBe("consent.source.ipAddress.empty");
  });
});

describe("consent withdrawal", () => {
  it("becomes inactive once withdrawn", () => {
    const consent = consentFactory();
    const withdrawn = consent.withdraw(new Date("2026-02-01T00:00:00.000Z"));
    expect(isOk(withdrawn)).toBe(true);
    expect(consent.isActive).toBe(false);
    expect(consent.withdrawnAt).toEqual(new Date("2026-02-01T00:00:00.000Z"));
  });

  it("keeps the grant timestamp as proof both events happened", () => {
    const consent = consentFactory();
    const grantedAt = consent.grantedAt;
    consent.withdraw(new Date("2026-02-01T00:00:00.000Z"));
    expect(consent.grantedAt).toEqual(grantedAt);
  });

  it("records a withdrawn event", () => {
    const consent = consentFactory();
    consent.pullEvents();
    consent.withdraw(new Date("2026-02-01T00:00:00.000Z"));
    expect(consent.pullEvents()).toEqual([
      {
        name: "consent.withdrawn",
        tenantId: consent.tenantId,
        occurredAt: new Date("2026-02-01T00:00:00.000Z"),
        payload: { consentId: consent.id, subjectId: consent.subjectId, category: consent.category },
      },
    ]);
  });

  it("refuses to withdraw a consent twice", () => {
    const consent = consentFactory();
    consent.withdraw(new Date("2026-02-01T00:00:00.000Z"));
    const result = consent.withdraw(new Date("2026-02-02T00:00:00.000Z"));
    if (isOk(result)) throw new Error("Expected the second withdrawal to be rejected");
    expect(result.error.code).toBe("consent.alreadyWithdrawn");
  });
});

describe("consent coverage of the current policy", () => {
  it("covers processing when active and the policy version matches", () => {
    const consent = consentFactory({ policyVersion: "2026-01-01" });
    expect(consent.covers("2026-01-01")).toBe(true);
  });

  it("stops covering processing once the policy version changes", () => {
    const consent = consentFactory({ policyVersion: "2026-01-01" });
    expect(consent.covers("2026-06-01")).toBe(false);
  });

  it("stops covering processing once withdrawn, even under the same policy version", () => {
    const consent = consentFactory({ policyVersion: "2026-01-01" });
    consent.withdraw(new Date("2026-02-01T00:00:00.000Z"));
    expect(consent.covers("2026-01-01")).toBe(false);
  });
});

describe("consent restoration", () => {
  it("does not record an event", () => {
    const result = Consent.restore(consentSnapshotFactory());
    if (!isOk(result)) throw new Error("Expected the consent to be accepted");
    expect(result.value.pullEvents()).toEqual([]);
  });

  it("round trips through its snapshot", () => {
    const snapshot = consentSnapshotFactory();
    const result = Consent.restore(snapshot);
    if (!isOk(result)) throw new Error("Expected the consent to be accepted");
    expect(result.value.toSnapshot()).toEqual(snapshot);
  });
});

describe("consent data classification", () => {
  it("declares the subject and the capture source as personal data", () => {
    expect([
      consentFieldClassifications.subjectId,
      consentFieldClassifications.sourceIpAddress,
      consentFieldClassifications.sourceUserAgent,
    ]).toEqual(["personal", "personal", "personal"]);
  });

  it("does not classify the category or the policy version as personal", () => {
    expect([consentFieldClassifications.category, consentFieldClassifications.policyVersion]).toEqual([
      "none",
      "none",
    ]);
  });
});
