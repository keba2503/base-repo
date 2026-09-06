import { isPermissionAction, resourceOfAction, roleAllows, type TenantId } from "@base/domain";
import type { PermissionRequest, Permissions } from "../kernel/ports/permissions";
import type { MembershipRepository } from "./ports/membership-repository";

export type RolePermissionsDependencies = {
  readonly membershipsScopedTo: (tenantId: TenantId) => MembershipRepository;
};

export class RolePermissions implements Permissions {
  readonly #membershipsScopedTo: (tenantId: TenantId) => MembershipRepository;

  constructor(dependencies: RolePermissionsDependencies) {
    this.#membershipsScopedTo = dependencies.membershipsScopedTo;
  }

  async can(request: PermissionRequest): Promise<boolean> {
    const { actor, action, resource } = request;
    if (isPermissionAction(action) && resourceOfAction(action) !== resource) return false;
    if (actor.kind !== "user") return actor.scopes.includes(action);

    const memberships = await this.#membershipsScopedTo(actor.tenantId).findByUserId(actor.subjectId);
    const membership = memberships.find((candidate) => candidate.tenantId === actor.tenantId);
    if (!membership) return false;
    return roleAllows({ role: membership.role, action });
  }
}
