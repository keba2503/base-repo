import { beforeEach, describe, expect, it } from "bun:test";
import { isErr, isOk, Tenant, type DomainError, type Result } from "@base/domain";
import { createTenant, type CreateTenant, type TenantResponse } from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import {
  StubAuditTrail,
  StubClock,
  StubIdGenerator,
  StubOutbox,
  StubPermissions,
  StubTenantRepository,
  StubUnitOfWork,
} from "./doubles/ports";

const createdAt = new Date("2026-01-15T10:00:00.000Z");

type Harness = {
  useCase: CreateTenant;
  tenants: StubTenantRepository;
  outbox: StubOutbox;
  unitOfWork: StubUnitOfWork;
  permissions: StubPermissions;
  audit: StubAuditTrail;
};

function harnessFactory(granted: readonly string[] = ["tenants:create"]): Harness {
  const tenants = new StubTenantRepository();
  const outbox = new StubOutbox();
  const unitOfWork = new StubUnitOfWork();
  const permissions = new StubPermissions(granted);
  const audit = new StubAuditTrail();
  const useCase = createTenant({
    tenants,
    auditScopedTo: () => audit,
    permissions,
    clock: new StubClock(createdAt),
    idGenerator: new StubIdGenerator(),
    unitOfWork,
    outbox,
  });
  return { useCase, tenants, outbox, unitOfWork, permissions, audit };
}

function expectOk(result: Result<TenantResponse, DomainError>): TenantResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

function expectErr(result: Result<TenantResponse, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("creating a tenant", () => {
  it("returns the created tenant", async () => {
    const response = expectOk(await harness.useCase({ actor: actorFactory(), name: "Acme Clinic", slug: "acme-clinic" }));
    expect(response).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Acme Clinic",
      slug: "acme-clinic",
      createdAt,
    });
  });

  it("stores the tenant", async () => {
    await harness.useCase({ actor: actorFactory(), name: "Acme Clinic", slug: "acme-clinic" });
    expect(harness.tenants.saved.map((tenant) => tenant.slug)).toEqual(["acme-clinic"]);
  });

  it("persists inside a single unit of work", async () => {
    await harness.useCase({ actor: actorFactory(), name: "Acme Clinic", slug: "acme-clinic" });
    expect(harness.unitOfWork.runs).toBe(1);
  });

  it("enqueues the creation event", async () => {
    await harness.useCase({ actor: actorFactory(), name: "Acme Clinic", slug: "acme-clinic" });
    expect(harness.outbox.events.map((event) => event.name)).toEqual(["tenant.created"]);
  });

  it("asks the permissions port before acting", async () => {
    await harness.useCase({ actor: actorFactory(), name: "Acme Clinic", slug: "acme-clinic" });
    expect(harness.permissions.requests.map((request) => request.action)).toEqual(["tenants:create"]);
  });
});

describe("rejecting a tenant", () => {
  it("refuses an actor without the create permission", async () => {
    const denied = harnessFactory([]);
    const error = expectErr(await denied.useCase({ actor: actorFactory(), name: "Acme Clinic", slug: "acme-clinic" }));
    expect(error.kind).toBe("forbidden");
  });

  it("writes nothing when the actor is not allowed", async () => {
    const denied = harnessFactory([]);
    await denied.useCase({ actor: actorFactory(), name: "Acme Clinic", slug: "acme-clinic" });
    expect(denied.tenants.saved).toEqual([]);
  });

  it("refuses a slug already taken", async () => {
    const existing = Tenant.create({
      id: tenantIdFactory(1),
      name: "Acme Clinic",
      slug: "acme-clinic",
      createdAt,
    });
    if (!isOk(existing)) throw new Error("Expected a valid tenant");
    harness.tenants.seed(existing.value);
    const error = expectErr(await harness.useCase({ actor: actorFactory(), name: "Other", slug: "acme-clinic" }));
    expect(error.code).toBe("tenant.slug.taken");
  });

  it("refuses a name that breaks the domain invariant", async () => {
    const error = expectErr(await harness.useCase({ actor: actorFactory(), name: "a", slug: "acme-clinic" }));
    expect(error.code).toBe("tenant.name.length");
  });

  it("refuses a slug that breaks the domain invariant", async () => {
    const error = expectErr(await harness.useCase({ actor: actorFactory(), name: "Acme Clinic", slug: "Acme" }));
    expect(error.code).toBe("tenant.slug.format");
  });

  it("enqueues nothing when the domain rejects the tenant", async () => {
    await harness.useCase({ actor: actorFactory(), name: "a", slug: "acme-clinic" });
    expect(harness.outbox.events).toEqual([]);
  });
});
