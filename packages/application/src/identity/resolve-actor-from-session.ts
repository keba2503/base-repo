import {
  actionsOf,
  err,
  forbidden,
  isErr,
  isOk,
  ok,
  parseTenantId,
  type DomainError,
  type Membership,
  type Result,
  type TenantId,
} from "@base/domain";
import type { Actor } from "../kernel/actor";
import type { TenantRepository } from "../tenants/ports/tenant-repository";
import type { ResolveActorFromSessionRequest } from "./models";
import type { IdentityProvider } from "./ports/identity-provider";
import type { MembershipRepository } from "./ports/membership-repository";

export type ResolveActorFromSessionDependencies = {
  readonly identityProvider: IdentityProvider;
  readonly memberships: MembershipRepository;
  readonly tenants: TenantRepository;
};

export type ResolveActorFromSession = (
  request: ResolveActorFromSessionRequest,
) => Promise<Result<Actor, DomainError>>;

const noMembership = forbidden("identity.session.noMembership", "This user belongs to no tenant");
const notMember = forbidden("identity.session.notMember", "This user does not belong to the requested tenant");

async function requestedTenantId(
  request: ResolveActorFromSessionRequest,
  tenants: TenantRepository,
): Promise<Result<TenantId | undefined, DomainError>> {
  if (request.tenantId !== undefined) {
    const parsed = parseTenantId(request.tenantId);
    return isOk(parsed) ? parsed : err(notMember);
  }
  if (request.tenantSlug !== undefined) {
    const tenant = await tenants.findBySlug(request.tenantSlug);
    return tenant ? ok(tenant.id) : err(notMember);
  }
  return ok(undefined);
}

function selectMembership(
  memberships: readonly Membership[],
  tenantId: TenantId | undefined,
): Result<Membership, DomainError> {
  const [first] = memberships;
  if (!first) return err(noMembership);
  if (tenantId === undefined) return ok(first);
  const requested = memberships.find((membership) => membership.tenantId === tenantId);
  return requested ? ok(requested) : err(notMember);
}

export function resolveActorFromSession(
  dependencies: ResolveActorFromSessionDependencies,
): ResolveActorFromSession {
  const { identityProvider, memberships, tenants } = dependencies;

  return async (request) => {
    const session = await identityProvider.verifySession({ token: request.token });
    if (isErr(session)) return session;

    const tenantId = await requestedTenantId(request, tenants);
    if (isErr(tenantId)) return tenantId;

    const owned = await memberships.findByUserId(session.value.subjectId);
    const selected = selectMembership(owned, tenantId.value);
    if (isErr(selected)) return selected;

    return ok({
      tenantId: selected.value.tenantId,
      subjectId: session.value.subjectId,
      kind: "user",
      scopes: actionsOf(selected.value.role),
    });
  };
}
