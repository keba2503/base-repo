import { err, isErr, notFound, ok, type Consent, type DomainError, type Result, type TenantId } from "@base/domain";
import type { AuditTrail } from "../audit/ports/audit-trail";
import { authorize } from "../kernel/authorize";
import type { Clock } from "../kernel/ports/clock";
import type { Outbox } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import { withdrawConsentAction, consentResource, type ConsentResponse, type WithdrawConsentRequest } from "./models";
import type { ConsentRepository } from "./ports/consent-repository";

export type WithdrawConsentDependencies = {
  readonly consentsScopedTo: (tenantId: TenantId) => ConsentRepository;
  readonly auditScopedTo: (tenantId: TenantId) => AuditTrail;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: Outbox;
};

export type WithdrawConsent = (request: WithdrawConsentRequest) => Promise<Result<ConsentResponse, DomainError>>;

function toResponse(consent: Consent): ConsentResponse {
  return {
    id: consent.id,
    subjectId: consent.subjectId,
    category: consent.category,
    policyVersion: consent.policyVersion,
    grantedAt: consent.grantedAt,
    withdrawnAt: consent.withdrawnAt,
  };
}

export function withdrawConsent(dependencies: WithdrawConsentDependencies): WithdrawConsent {
  const { consentsScopedTo, auditScopedTo, permissions, clock, unitOfWork, outbox } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: withdrawConsentAction,
      resource: consentResource,
    });
    if (isErr(authorization)) return authorization;

    const consents = consentsScopedTo(request.actor.tenantId);
    const consent = await consents.findActive(request.subjectId, request.category);
    if (!consent) {
      return err(notFound("consent.notFound", "No active consent exists for this subject and category"));
    }

    const withdrawn = consent.withdraw(clock.now());
    if (isErr(withdrawn)) return withdrawn;

    await unitOfWork.run({ kind: "tenant", tenantId: request.actor.tenantId }, async () => {
      await consents.save(consent);
      await outbox.enqueue(consent.pullEvents());
      await auditScopedTo(request.actor.tenantId).record({
        tenantId: request.actor.tenantId,
        occurredAt: clock.now(),
        actorId: request.actor.subjectId,
        actorKind: request.actor.kind,
        action: withdrawConsentAction,
        resourceType: "consent",
        resourceId: consent.id,
      });
    });

    return ok(toResponse(consent));
  };
}
