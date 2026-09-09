import { describe, expect, it } from "bun:test";
import {
  actionsOf,
  isPermissionAction,
  isRole,
  permissionActions,
  permissionMatrix,
  resourceOfAction,
  roleAllows,
  roles,
} from "../src/identity/role";

describe("permission matrix", () => {
  it("lets only the owner create tenants", () => {
    expect(roles.filter((role) => roleAllows({ role, action: "tenants:create" }))).toEqual(["owner"]);
  });

  it("lets every role read tenants", () => {
    expect(roles.every((role) => roleAllows({ role, action: "tenants:read" }))).toBe(true);
  });

  it("lets the owner and the admin manage api keys", () => {
    expect(roles.filter((role) => roleAllows({ role, action: "apikeys:manage" }))).toEqual(["owner", "admin"]);
  });

  it("lets the owner and the admin manage members", () => {
    expect(roles.filter((role) => roleAllows({ role, action: "members:manage" }))).toEqual(["owner", "admin"]);
  });

  it("lets the owner and the admin start payments", () => {
    expect(roles.filter((role) => roleAllows({ role, action: "payments:start" }))).toEqual(["owner", "admin"]);
  });

  it("denies an action it does not know", () => {
    expect(roleAllows({ role: "owner", action: "tenants:delete" })).toBe(false);
  });

  it("declares only known actions for every role", () => {
    const declared = Object.values(permissionMatrix).flat();
    expect(declared.every((action) => permissionActions.includes(action))).toBe(true);
  });

  it("lists the actions of a role", () => {
    expect(actionsOf("member")).toEqual(["tenants:read", "documents:upload", "documents:read"]);
  });
});

describe("role and action guards", () => {
  it("recognises a known role", () => {
    expect(isRole("admin")).toBe(true);
  });

  it("rejects an unknown role", () => {
    expect(isRole("superuser")).toBe(false);
  });

  it("recognises a known action", () => {
    expect(isPermissionAction("apikeys:manage")).toBe(true);
  });

  it("rejects an unknown action", () => {
    expect(isPermissionAction("apikeys:destroy")).toBe(false);
  });
});

describe("resource of an action", () => {
  it("maps every tenant action to the tenant resource", () => {
    expect([resourceOfAction("tenants:create"), resourceOfAction("tenants:read")]).toEqual(["tenant", "tenant"]);
  });

  it("maps the api key action to the api key resource", () => {
    expect(resourceOfAction("apikeys:manage")).toBe("apiKey");
  });

  it("maps the member action to the member resource", () => {
    expect(resourceOfAction("members:manage")).toBe("member");
  });

  it("maps the payments action to the payment resource", () => {
    expect(resourceOfAction("payments:start")).toBe("payment");
  });
});
