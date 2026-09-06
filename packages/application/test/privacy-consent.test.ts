import { beforeEach, describe, expect, it } from "bun:test";
import { entityIdOf, isErr, isOk, type DomainError, type Result } from "@base/domain";
import {
  grantConsent,
  hasActiveConsent,
  requestDataExport,
  requestErasure,
  withdrawConsent,
  type GrantConsent,
  type HasActiveConsent,
  type RequestDataExport,
  type RequestErasure,
  type WithdrawConsent,
} from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import {
  StubAuditTrail,
  StubClock,
  StubIdGenerator,
  StubJobQueue,
  StubOutbox,
  StubPermissions,
  StubUnitOfWork,
} from "./doubles/ports";
import { StubConsentRepository } from "./doubles/privacy-ports";

const grantedAt = new Date("2026-01-15T10:00:00.000Z");
const subjectId = entityIdOf(tenantIdFactory(500));

function expectOk<Value>(result: Result<Value, DomainError>): Value {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

function expectErr<Value>(result: Result<Value, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

type Harness = {
  grant: GrantConsent;
  withdraw: WithdrawConsent;
  hasConsent: HasActiveConsent;
  consents: StubConsentRepository;
  outbox: StubOutbox;
  audit: StubAuditTrail;
};

function harnessFactory(granted: readonly string[] = ["consent:grant", "consent:withdraw", "consent:read"]): Harness {
  const consents = new StubConsentRepository();
  const outbox = new StubOutbox();
  const audit = new StubAuditTrail();
  const permissions = new StubPermissions(granted);
  const clock = new StubClock(grantedAt);
  const grant = grantConsent({
    consentsScopedTo: () => consents,
    auditScopedTo: () => audit,
    permissions,
    clock,
    idGenerator: new StubIdGenerator(),
    unitOfWork: new StubUnitOfWork(),
    outbox,
  });
  const withdraw = withdrawConsent({
    consentsScopedTo: () => consents,
    auditScopedTo: () => audit,
    permissions,
    clock,
    unitOfWork: new StubUnitOfWork(),
    outbox,
  });
  const hasConsent = hasActiveConsent({ consentsScopedTo: () => consents, permissions });
  return { grant, withdraw, hasConsent, consents, outbox, audit };
}

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

function grantRequest(overrides: Partial<Parameters<GrantConsent>[0]> = {}): Parameters<GrantConsent>[0] {
  return {
    actor: actorFactory({ scopes: ["consent:grant", "consent:withdraw", "consent:read"] }),
    subjectId,
    category: "analytics",
    policyVersion: "2026-01-01",
    sourceIpAddress: "203.0.113.10",
    sourceUserAgent: "Mozilla/5.0",
    ...overrides,
  };
}

describe("granting consent", () => {
  it("returns the granted consent", async () => {
    const response = expectOk(await harness.grant(grantRequest()));
    expect(response.category).toBe("analytics");
    expect(response.withdrawnAt).toBeNull();
  });

  it("stores it", async () => {
    await harness.grant(grantRequest());
    expect(harness.consents.saved).toHaveLength(1);
  });

  it("enqueues the granted event", async () => {
    await harness.grant(grantRequest());
    expect(harness.outbox.events.map((event) => event.name)).toEqual(["consent.granted"]);
  });

  it("refuses an actor without the grant scope", async () => {
    const denied = harnessFactory([]);
    const error = expectErr(await denied.grant(grantRequest({ actor: actorFactory({ scopes: [] }) })));
    expect(error.kind).toBe("forbidden");
  });
});

describe("withdrawing consent", () => {
  it("marks the consent inactive without deleting it", async () => {
    await harness.grant(grantRequest());
    const withdrawn = expectOk(
      await harness.withdraw({
        actor: actorFactory({ scopes: ["consent:withdraw"] }),
        subjectId,
        category: "analytics",
      }),
    );
    expect(withdrawn.withdrawnAt).not.toBeNull();
    expect(harness.consents.saved).toHaveLength(1);
  });

  it("refuses to withdraw a consent that was never granted", async () => {
    const error = expectErr(
      await harness.withdraw({
        actor: actorFactory({ scopes: ["consent:withdraw"] }),
        subjectId,
        category: "marketing",
      }),
    );
    expect(error.code).toBe("consent.notFound");
  });
});

describe("checking active consent against the current policy", () => {
  it("covers processing once granted under the current policy version", async () => {
    await harness.grant(grantRequest({ policyVersion: "2026-01-01" }));
    const response = expectOk(
      await harness.hasConsent({
        actor: actorFactory({ scopes: ["consent:read"] }),
        subjectId,
        category: "analytics",
        policyVersion: "2026-01-01",
      }),
    );
    expect(response.covered).toBe(true);
  });

  it("stops covering processing once the policy text changes version", async () => {
    await harness.grant(grantRequest({ policyVersion: "2026-01-01" }));
    const response = expectOk(
      await harness.hasConsent({
        actor: actorFactory({ scopes: ["consent:read"] }),
        subjectId,
        category: "analytics",
        policyVersion: "2026-06-01",
      }),
    );
    expect(response.covered).toBe(false);
  });

  it("reports no coverage once withdrawn", async () => {
    await harness.grant(grantRequest({ policyVersion: "2026-01-01" }));
    await harness.withdraw({ actor: actorFactory({ scopes: ["consent:withdraw"] }), subjectId, category: "analytics" });
    const response = expectOk(
      await harness.hasConsent({
        actor: actorFactory({ scopes: ["consent:read"] }),
        subjectId,
        category: "analytics",
        policyVersion: "2026-01-01",
      }),
    );
    expect(response.covered).toBe(false);
  });
});

describe("requesting the rights that run through the job queue", () => {
  it("enqueues a data export job", async () => {
    const jobs = new StubJobQueue();
    const useCase: RequestDataExport = requestDataExport({ jobs, permissions: new StubPermissions(["privacy:export"]) });
    await useCase({ actor: actorFactory({ scopes: ["privacy:export"] }), subjectId });
    const claimed = await jobs.claimDue(10, new Date(8640000000000000));
    expect(claimed.map((job) => job.name)).toEqual(["privacy.export.subject"]);
    expect(claimed[0]?.payload).toEqual({ subjectId });
  });

  it("enqueues an erasure job", async () => {
    const jobs = new StubJobQueue();
    const useCase: RequestErasure = requestErasure({ jobs, permissions: new StubPermissions(["privacy:erasure"]) });
    await useCase({ actor: actorFactory({ scopes: ["privacy:erasure"] }), subjectId });
    const claimed = await jobs.claimDue(10, new Date(8640000000000000));
    expect(claimed.map((job) => job.name)).toEqual(["privacy.erasure.subject"]);
  });

  it("refuses to enqueue an export without the export scope", async () => {
    const jobs = new StubJobQueue();
    const useCase: RequestDataExport = requestDataExport({ jobs, permissions: new StubPermissions([]) });
    const error = expectErr(await useCase({ actor: actorFactory({ scopes: [] }), subjectId }));
    expect(error.kind).toBe("forbidden");
  });
});
