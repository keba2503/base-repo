import { beforeEach, describe, expect, it } from "bun:test";
import { isErr, isOk, type DomainError, type Result } from "@base/domain";
import { registerUser, type RegisterUser, type UserResponse } from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import { emailFactory, entityIdFactory, membershipFactory, userFactory } from "./factories/identity";
import { StubMembershipRepository, StubUserRepository } from "./doubles/identity-ports";
import { StubClock, StubOutbox, StubPermissions, StubUnitOfWork } from "./doubles/ports";

const createdAt = new Date("2026-01-15T10:00:00.000Z");
const tenantId = tenantIdFactory(900);
const otherTenantId = tenantIdFactory(901);
const actorId = entityIdFactory(1);
const newSubjectId = entityIdFactory(10);

type Harness = {
  useCase: RegisterUser;
  users: StubUserRepository;
  memberships: StubMembershipRepository;
  outbox: StubOutbox;
};

function harnessFactory(granted: readonly string[] = ["members:manage"]): Harness {
  const users = new StubUserRepository();
  const memberships = new StubMembershipRepository();
  const outbox = new StubOutbox();
  const useCase = registerUser({
    users,
    memberships,
    permissions: new StubPermissions(granted),
    clock: new StubClock(createdAt),
    unitOfWork: new StubUnitOfWork(),
    outbox,
  });
  return { useCase, users, memberships, outbox };
}

function expectOk(result: Result<UserResponse, DomainError>): UserResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

function expectErr(result: Result<UserResponse, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

const actor = actorFactory({ tenantId, subjectId: actorId, kind: "user" });

const request = {
  actor,
  subjectId: newSubjectId,
  email: "New@Example.com",
  displayName: "New Person",
  role: "member",
};

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("registering a new user", () => {
  it("returns the user with the granted role", async () => {
    expect(expectOk(await harness.useCase(request))).toEqual({
      id: newSubjectId,
      tenantId,
      email: "new@example.com",
      displayName: "New Person",
      role: "member",
      createdAt,
    });
  });

  it("stores the user in the actor tenant", async () => {
    await harness.useCase(request);
    expect(harness.users.saved.map((user) => [user.id, user.tenantId])).toEqual([[newSubjectId, tenantId]]);
  });

  it("stores the membership", async () => {
    await harness.useCase(request);
    expect(harness.memberships.saved.map((membership) => membership.toSnapshot())).toEqual([
      { userId: newSubjectId, tenantId, role: "member" },
    ]);
  });

  it("enqueues the registration event", async () => {
    await harness.useCase(request);
    expect(harness.outbox.events.map((event) => event.name)).toEqual(["user.registered"]);
  });
});

describe("registering a known user into another tenant", () => {
  it("adds a membership without a second registration event", async () => {
    harness.users.seed(userFactory({ id: newSubjectId, tenantId: otherTenantId }));
    harness.memberships.seed(membershipFactory({ userId: newSubjectId, tenantId: otherTenantId }));
    await harness.useCase(request);
    expect([harness.memberships.saved.length, harness.outbox.events]).toEqual([2, []]);
  });

  it("keeps the home tenant of the existing user", async () => {
    harness.users.seed(userFactory({ id: newSubjectId, tenantId: otherTenantId }));
    const response = expectOk(await harness.useCase(request));
    expect(harness.users.saved[0]?.tenantId).toBe(otherTenantId);
    expect(response.tenantId).toBe(tenantId);
  });
});

describe("refusing a registration", () => {
  it("refuses an actor without the members permission", async () => {
    const denied = harnessFactory([]);
    expect(expectErr(await denied.useCase(request)).kind).toBe("forbidden");
  });

  it("refuses an unknown role", async () => {
    expect(expectErr(await harness.useCase({ ...request, role: "superuser" })).code).toBe("membership.role.unknown");
  });

  it("lets an owner grant the owner role", async () => {
    harness.memberships.seed(membershipFactory({ userId: actorId, tenantId, role: "owner" }));
    expect(isOk(await harness.useCase({ ...request, role: "owner" }))).toBe(true);
  });

  it("refuses an admin granting the owner role", async () => {
    harness.memberships.seed(membershipFactory({ userId: actorId, tenantId, role: "admin" }));
    expect(expectErr(await harness.useCase({ ...request, role: "owner" })).code).toBe(
      "membership.owner.grantRequiresOwner",
    );
  });

  it("refuses a malformed subject id", async () => {
    expect(expectErr(await harness.useCase({ ...request, subjectId: "nope" })).kind).toBe("invariantViolation");
  });

  it("refuses an invalid email", async () => {
    expect(expectErr(await harness.useCase({ ...request, email: "nope" })).code).toBe("email.format");
  });

  it("refuses a user already in the tenant", async () => {
    harness.users.seed(userFactory({ id: newSubjectId, tenantId }));
    harness.memberships.seed(membershipFactory({ userId: newSubjectId, tenantId }));
    expect(expectErr(await harness.useCase(request)).code).toBe("membership.exists");
  });

  it("refuses an email another subject already uses", async () => {
    harness.users.seed(userFactory({ id: entityIdFactory(11), email: emailFactory("new@example.com") }));
    expect(expectErr(await harness.useCase(request)).code).toBe("user.email.taken");
  });

  it("refuses a display name that breaks the domain invariant", async () => {
    expect(expectErr(await harness.useCase({ ...request, displayName: " " })).code).toBe("user.displayName.length");
  });
});
