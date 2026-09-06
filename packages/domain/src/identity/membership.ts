import { classify, type FieldClassifications } from "../kernel/classification";
import { invariantViolation, type DomainError } from "../kernel/domain-error";
import type { EntityId, TenantId } from "../kernel/identifiers";
import { err, ok, type Result } from "../kernel/result";
import { isRole, type Role } from "./role";

export type MembershipSnapshot = {
  readonly userId: EntityId;
  readonly tenantId: TenantId;
  readonly role: Role;
};

export const membershipFieldClassifications: FieldClassifications<MembershipSnapshot> =
  classify<MembershipSnapshot>({
    userId: "none",
    tenantId: "none",
    role: "none",
  });

export class Membership {
  readonly userId: EntityId;
  readonly tenantId: TenantId;
  readonly role: Role;

  private constructor(snapshot: MembershipSnapshot) {
    this.userId = snapshot.userId;
    this.tenantId = snapshot.tenantId;
    this.role = snapshot.role;
  }

  static grant(snapshot: MembershipSnapshot): Result<Membership, DomainError> {
    return Membership.restore(snapshot);
  }

  static restore(snapshot: MembershipSnapshot): Result<Membership, DomainError> {
    if (!isRole(snapshot.role)) {
      return err(
        invariantViolation("membership.role.unknown", "A membership role must be owner, admin or member"),
      );
    }
    return ok(new Membership(snapshot));
  }

  toSnapshot(): MembershipSnapshot {
    return { userId: this.userId, tenantId: this.tenantId, role: this.role };
  }
}
