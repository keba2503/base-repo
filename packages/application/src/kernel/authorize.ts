import { forbidden, ok, err, type DomainError, type Result } from "@base/domain";
import type { Permissions, PermissionRequest } from "./ports/permissions";

export type AuthorizationRequest = PermissionRequest & {
  readonly permissions: Permissions;
};

export async function authorize(request: AuthorizationRequest): Promise<Result<void, DomainError>> {
  const { permissions, actor, action, resource } = request;
  const allowed = await permissions.can({ actor, action, resource });
  if (!allowed) {
    return err(forbidden("authorization.denied", `The actor may not perform ${action} on ${resource}`));
  }
  return ok(undefined);
}
