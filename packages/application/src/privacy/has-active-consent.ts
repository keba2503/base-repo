import { isErr, ok, type DomainError, type Result, type TenantId } from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { Permissions } from "../kernel/ports/permissions";
import { readConsentAction, consentResource, type HasActiveConsentRequest, type HasActiveConsentResponse } from "./models";
import type { ConsentRepository } from "./ports/consent-repository";

export type HasActiveConsentDependencies = {
  readonly consentsScopedTo: (tenantId: TenantId) => ConsentRepository;
  readonly permissions: Permissions;
};

export type HasActiveConsent = (
  request: HasActiveConsentRequest,
) => Promise<Result<HasActiveConsentResponse, DomainError>>;

export function hasActiveConsent(dependencies: HasActiveConsentDependencies): HasActiveConsent {
  const { consentsScopedTo, permissions } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: readConsentAction,
      resource: consentResource,
    });
    if (isErr(authorization)) return authorization;

    const consents = consentsScopedTo(request.actor.tenantId);
    const consent = await consents.findActive(request.subjectId, request.category);
    return ok({ covered: consent?.covers(request.policyVersion) ?? false });
  };
}
