import { describe, expect, it } from "bun:test";
import type { Actor, PermissionRequest, Permissions } from "@base/application";
import { entityIdOf } from "@base/domain";
import { tenantIdFactory } from "../factories/tenant";

const actor: Actor = {
  tenantId: tenantIdFactory(1),
  subjectId: entityIdOf(tenantIdFactory(2)),
  kind: "user",
  scopes: ["tenants:create"],
};

const request: PermissionRequest = { actor, action: "tenants:create", resource: "tenant" };

export function describePermissionsContract(
  name: string,
  createPermissions: () => Permissions,
): void {
  describe(`${name} satisfies the Permissions contract`, () => {
    it("resolves to a boolean", async () => {
      expect(typeof (await createPermissions().can(request))).toBe("boolean");
    });

    it("answers the same request the same way", async () => {
      const permissions = createPermissions();
      const first = await permissions.can(request);
      const second = await permissions.can(request);
      expect(second).toBe(first);
    });
  });
}
