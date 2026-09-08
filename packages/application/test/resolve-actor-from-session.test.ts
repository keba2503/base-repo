import { describe, expect, it } from "bun:test";
import { isErr, isOk, Tenant, type DomainError, type Result } from "@base/domain";
import { resolveActorFromSession, type Actor, type ResolveActorFromSession } from "../src/index";
import { tenantIdFactory } from "./factories/actor";
import { emailFactory, entityIdFactory, membershipFactory } from "./factories/identity";
import { StubIdentityProvider, StubMembershipRepository } from "./doubles/identity-ports";
import { StubTenantRepository } from "./doubles/ports";

const userId = entityIdFactory(10);
const firstTenantId = tenantIdFactory(1);
const secondTenantId = tenantIdFactory(2);

type Harness = {
  useCase: ResolveActorFromSession;
  memberships: StubMembershipRepository;
};

function harnessFactory(): Harness {
  const identityProvider = new StubIdentityProvider();
  identityProvider.issue("valid-token", { subjectId: userId, email: emailFactory() });

  const tenants = new StubTenantRepository();
  const second = Tenant.create({
    id: secondTenantId,
    name: "Beta Clinic",
    slug: "beta-clinic",
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
  });
  if (!isOk(second)) throw new Error("Expected a valid tenant");
  tenants.seed(second.value);

  const memberships = new StubMembershipRepository();
  return { useCase: resolveActorFromSession({ identityProvider, memberships, tenants }), memberships };
}

function expectActor(result: Result<Actor, DomainError>): Actor {
  if (!isOk(result)) throw new Error(`Expected an actor, received ${result.error.code}`);
  return result.value;
}

function expectFailure(result: Result<Actor, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

function seedTwoMemberships(harness: Harness): void {
  harness.memberships.seed(membershipFactory({ userId, tenantId: firstTenantId, role: "owner" }));
  harness.memberships.seed(membershipFactory({ userId, tenantId: secondTenantId, role: "member" }));
}

describe("resolving an actor from a session", () => {
  it("builds a user actor for the first membership by default", async () => {
    const harness = harnessFactory();
    seedTwoMemberships(harness);
    expect(expectActor(await harness.useCase({ token: "valid-token" }))).toEqual({
      tenantId: firstTenantId,
      subjectId: userId,
      kind: "user",
      scopes: [
        "tenants:create",
        "tenants:read",
        "apikeys:manage",
        "members:manage",
        "documents:upload",
        "documents:read",
        "payments:start",
      ],
    });
  });

  it("selects the membership named by tenant id", async () => {
    const harness = harnessFactory();
    seedTwoMemberships(harness);
    const actor = expectActor(await harness.useCase({ token: "valid-token", tenantId: secondTenantId }));
    expect([actor.tenantId, actor.scopes]).toEqual([
      secondTenantId,
      ["tenants:read", "documents:upload", "documents:read"],
    ]);
  });

  it("selects the membership named by tenant slug", async () => {
    const harness = harnessFactory();
    seedTwoMemberships(harness);
    const actor = expectActor(await harness.useCase({ token: "valid-token", tenantSlug: "beta-clinic" }));
    expect(actor.tenantId).toBe(secondTenantId);
  });

  it("refuses a session the provider does not recognise", async () => {
    const harness = harnessFactory();
    seedTwoMemberships(harness);
    expect(expectFailure(await harness.useCase({ token: "forged" })).kind).toBe("forbidden");
  });

  it("refuses a user without any membership", async () => {
    const harness = harnessFactory();
    expect(expectFailure(await harness.useCase({ token: "valid-token" })).code).toBe(
      "identity.session.noMembership",
    );
  });

  it("refuses a tenant the user does not belong to", async () => {
    const harness = harnessFactory();
    harness.memberships.seed(membershipFactory({ userId, tenantId: firstTenantId, role: "owner" }));
    expect(expectFailure(await harness.useCase({ token: "valid-token", tenantId: secondTenantId })).code).toBe(
      "identity.session.notMember",
    );
  });

  it("refuses an unknown tenant slug without revealing whether it exists", async () => {
    const harness = harnessFactory();
    seedTwoMemberships(harness);
    expect(expectFailure(await harness.useCase({ token: "valid-token", tenantSlug: "unknown" })).code).toBe(
      "identity.session.notMember",
    );
  });

  it("refuses a malformed tenant id the same way", async () => {
    const harness = harnessFactory();
    seedTwoMemberships(harness);
    expect(expectFailure(await harness.useCase({ token: "valid-token", tenantId: "nope" })).code).toBe(
      "identity.session.notMember",
    );
  });
});
