import { isPermissionAction, resourceOfAction } from "@base/domain";
import type { Permissions } from "@base/application";

export class AllowAllPermissions implements Permissions {
  can(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

export class DenyAllPermissions implements Permissions {
  can(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

export class ScopedPermissions implements Permissions {
  can(request: { actor: { scopes: readonly string[] }; action: string; resource: string }): Promise<boolean> {
    if (isPermissionAction(request.action) && resourceOfAction(request.action) !== request.resource) {
      return Promise.resolve(false);
    }
    return Promise.resolve(request.actor.scopes.includes(request.action));
  }
}
