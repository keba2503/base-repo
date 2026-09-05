import { describe, expect, it } from "bun:test";
import { isErr, isOk } from "@base/domain";
import { authorize } from "../src/index";
import { actorFactory } from "./factories/actor";
import { StubPermissions } from "./doubles/ports";

describe("authorize", () => {
  it("succeeds when the permissions port allows the action", async () => {
    const result = await authorize({
      permissions: new StubPermissions(["tenants:create"]),
      actor: actorFactory(),
      action: "tenants:create",
      resource: "tenant",
    });
    expect(isOk(result)).toBe(true);
  });

  it("fails with a forbidden error when the port denies the action", async () => {
    const result = await authorize({
      permissions: new StubPermissions([]),
      actor: actorFactory(),
      action: "tenants:create",
      resource: "tenant",
    });
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.kind).toBe("forbidden");
  });
});
