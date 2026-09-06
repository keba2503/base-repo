import { Consent, isErr, ok, type DomainError, type Result, type TenantId } from "@base/domain";
import type { AuditTrail } from "../audit/ports/audit-trail";
import { authorize } from "../kernel/authorize";
import type { Clock } from "../kernel/ports/clock";
import type { IdGenerator } from "../kernel/ports/id-generator";
import type { OutboxWriter } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import { grantConsentAction, consentResource, type ConsentResponse, type GrantConsentRequest } from "./models";
import type { ConsentRepository } from "./ports/consent-repository";

export type GrantConsentDependencies = {
  readonly consentsScopedTo: (tenantId: TenantId) => ConsentRepository;
  readonly auditScopedTo: (tenantId: TenantId) => AuditTrail;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: OutboxWriter;
};

export type GrantConsent = (request: GrantConsentRequest) => Promise<Result<ConsentResponse, DomainError>>;

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

export function grantConsent(dependencies: GrantConsentDependencies): GrantConsent {
  const { consentsScopedTo, auditScopedTo, permissions, clock, idGenerator, unitOfWork, outbox } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: grantConsentAction,
      resource: consentResource,
    });
    if (isErr(authorization)) return authorization;

    const consents = consentsScopedTo(request.actor.tenantId);
    const granted = Consent.grant({
      id: idGenerator.next(),
      tenantId: request.actor.tenantId,
      subjectId: request.subjectId,
      category: request.category,
      policyVersion: request.policyVersion,
      grantedAt: clock.now(),
      sourceIpAddress: request.sourceIpAddress,
      sourceUserAgent: request.sourceUserAgent,
    });
    if (isErr(granted)) return granted;

    const consent = granted.value;
    await unitOfWork.run({ kind: "tenant", tenantId: request.actor.tenantId }, async () => {
      await consents.save(consent);
      await outbox.enqueue(consent.pullEvents());
      await auditScopedTo(request.actor.tenantId).record({
        tenantId: request.actor.tenantId,
        occurredAt: clock.now(),
        actorId: request.actor.subjectId,
        actorKind: request.actor.kind,
        action: grantConsentAction,
        resourceType: "consent",
        resourceId: consent.id,
      });
    });

    return ok(toResponse(consent));
  };
}
