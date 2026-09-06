import { describe, expect, it } from "bun:test";
import { RolePermissions } from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import { entityIdFactory, membershipFactory } from "./factories/identity";
import { StubMembershipRepository } from "./doubles/identity-ports";

const tenantId = tenantIdFactory(900);
const otherTenantId = tenantIdFactory(901);
const userId = entityIdFactory(10);

function permissionsWith(...memberships: ReturnType<typeof membershipFactory>[]): RolePermissions {
  const repository = new StubMembershipRepository();
  for (const membership of memberships) repository.seed(membership);
  return new RolePermissions({ membershipsScopedTo: (scope) => repository.scopedTo(scope) });
}

function userActor(scopes: readonly string[] = []) {
  return actorFactory({ tenantId, subjectId: userId, kind: "user", scopes });
}

describe("role permissions for a user", () => {
  it("allows an action the role grants", async () => {
    const permissions = permissionsWith(membershipFactory({ userId, tenantId, role: "admin" }));
    expect(await permissions.can({ actor: userActor(), action: "apikeys:manage", resource: "apiKey" })).toBe(true);
  });

  it("denies an action the role does not grant", async () => {
    const permissions = permissionsWith(membershipFactory({ userId, tenantId, role: "member" }));
    expect(await permissions.can({ actor: userActor(), action: "apikeys:manage", resource: "apiKey" })).toBe(false);
  });

  it("denies a user without a membership in the actor tenant", async () => {
    const permissions = permissionsWith(membershipFactory({ userId, tenantId: otherTenantId, role: "owner" }));
    expect(await permissions.can({ actor: userActor(), action: "tenants:read", resource: "tenant" })).toBe(false);
  });

  it("ignores the scopes carried by a user actor", async () => {
    const permissions = permissionsWith(membershipFactory({ userId, tenantId, role: "member" }));
    const actor = userActor(["apikeys:manage"]);
    expect(await permissions.can({ actor, action: "apikeys:manage", resource: "apiKey" })).toBe(false);
  });

  it("reserves tenant creation for an owner", async () => {
    const owner = permissionsWith(membershipFactory({ userId, tenantId, role: "owner" }));
    const admin = permissionsWith(membershipFactory({ userId, tenantId, role: "admin" }));
    expect([
      await owner.can({ actor: userActor(), action: "tenants:create", resource: "tenant" }),
      await admin.can({ actor: userActor(), action: "tenants:create", resource: "tenant" }),
    ]).toEqual([true, false]);
  });
});

describe("role permissions for a machine actor", () => {
  it("allows an api key actor holding the scope", async () => {
    const actor = actorFactory({ kind: "apiKey", scopes: ["tenants:read"] });
    expect(await permissionsWith().can({ actor, action: "tenants:read", resource: "tenant" })).toBe(true);
  });

  it("denies an api key actor missing the scope", async () => {
    const actor = actorFactory({ kind: "apiKey", scopes: ["tenants:read"] });
    expect(await permissionsWith().can({ actor, action: "apikeys:manage", resource: "apiKey" })).toBe(false);
  });

  it("decides a system actor by its scopes", async () => {
    const actor = actorFactory({ kind: "system", scopes: ["tenants:create"] });
    expect(await permissionsWith().can({ actor, action: "tenants:create", resource: "tenant" })).toBe(true);
  });
});
