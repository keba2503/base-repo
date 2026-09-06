import {
  conflict,
  err,
  forbidden,
  invariantViolation,
  isErr,
  isRole,
  Membership,
  ok,
  parseEmail,
  parseEntityId,
  User,
  type DomainError,
  type Result,
  type Role,
} from "@base/domain";
import type { Actor } from "../kernel/actor";
import { authorize } from "../kernel/authorize";
import type { Clock } from "../kernel/ports/clock";
import type { Outbox } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import { manageMembersAction, memberResource, type RegisterUserRequest, type UserResponse } from "./models";
import type { MembershipRepository } from "./ports/membership-repository";
import type { UserRepository } from "./ports/user-repository";

export type RegisterUserDependencies = {
  readonly users: UserRepository;
  readonly memberships: MembershipRepository;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: Outbox;
};

export type RegisterUser = (request: RegisterUserRequest) => Promise<Result<UserResponse, DomainError>>;

function parseRole(role: string): Result<Role, DomainError> {
  if (!isRole(role)) {
    return err(invariantViolation("membership.role.unknown", "A membership role must be owner, admin or member"));
  }
  return ok(role);
}

async function ownerGrantAllowed(
  memberships: MembershipRepository,
  actor: Actor,
  role: Role,
): Promise<Result<void, DomainError>> {
  if (role !== "owner") return ok(undefined);
  const own = await memberships.findByUserId(actor.subjectId);
  const current = own.find((membership) => membership.tenantId === actor.tenantId);
  if (current?.role !== "owner") {
    return err(forbidden("membership.owner.grantRequiresOwner", "Only an owner may grant the owner role"));
  }
  return ok(undefined);
}

export function registerUser(dependencies: RegisterUserDependencies): RegisterUser {
  const { users, memberships, permissions, clock, unitOfWork, outbox } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: manageMembersAction,
      resource: memberResource,
    });
    if (isErr(authorization)) return authorization;

    const role = parseRole(request.role);
    if (isErr(role)) return role;

    const grant = await ownerGrantAllowed(memberships, request.actor, role.value);
    if (isErr(grant)) return grant;

    const subjectId = parseEntityId(request.subjectId);
    if (isErr(subjectId)) return subjectId;

    const email = parseEmail(request.email);
    if (isErr(email)) return email;

    const tenantId = request.actor.tenantId;
    const existing = await users.findById(subjectId.value);
    if (existing) {
      const owned = await memberships.findByUserId(existing.id);
      if (owned.some((membership) => membership.tenantId === tenantId)) {
        return err(conflict("membership.exists", "This user already belongs to the tenant"));
      }
    } else {
      const sameEmail = await users.findByEmail(email.value);
      if (sameEmail) return err(conflict("user.email.taken", "Another user already uses this email"));
    }

    const registered = existing
      ? ok(existing)
      : User.register({
          id: subjectId.value,
          tenantId,
          email: email.value,
          displayName: request.displayName,
          createdAt: clock.now(),
        });
    if (isErr(registered)) return registered;

    const membership = Membership.grant({ userId: subjectId.value, tenantId, role: role.value });
    if (isErr(membership)) return membership;

    const user = registered.value;
    await unitOfWork.run(async () => {
      if (!existing) {
        await users.save(user);
        await outbox.enqueue(user.pullEvents());
      }
      await memberships.save(membership.value);
    });

    return ok({
      id: user.id,
      tenantId,
      email: user.email,
      displayName: user.displayName,
      role: role.value,
      createdAt: user.createdAt,
    });
  };
}
