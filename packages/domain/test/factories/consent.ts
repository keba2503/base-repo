import { Consent, type ConsentSnapshot } from "../../src/consent/consent";
import { isOk } from "../../src/kernel/result";
import { entityIdFactory } from "./identity";
import { tenantIdFactory } from "./tenant";

export function consentSnapshotFactory(overrides: Partial<ConsentSnapshot> = {}): ConsentSnapshot {
  return {
    id: entityIdFactory(40),
    tenantId: tenantIdFactory(1),
    subjectId: entityIdFactory(10),
    category: "analytics",
    policyVersion: "2026-01-01",
    grantedAt: new Date("2026-01-15T10:00:00.000Z"),
    withdrawnAt: null,
    sourceIpAddress: "203.0.113.10",
    sourceUserAgent: "Mozilla/5.0",
    ...overrides,
  };
}

export function consentFactory(overrides: Partial<ConsentSnapshot> = {}): Consent {
  const granted = Consent.grant(consentSnapshotFactory(overrides));
  if (!isOk(granted)) throw new Error("The consent factory produced an invalid consent");
  return granted.value;
}
