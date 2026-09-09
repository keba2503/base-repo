import {
  err,
  forbidden,
  invariantViolation,
  isErr,
  isOk,
  ok,
  parseEntityId,
  type DomainError,
  type EntityId,
  type Payment,
  type PaymentTransition,
  type Result,
  type TenantId,
} from "@base/domain";
import type { AuditTrail } from "../audit/ports/audit-trail";
import { authorize } from "../kernel/authorize";
import type { Clock } from "../kernel/ports/clock";
import type { IdempotencyStore } from "../kernel/ports/idempotency-store";
import type { OutboxWriter } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import {
  paymentEventAmountMissingCode,
  paymentEventReasonMissingCode,
  paymentNotificationTenantMismatchCode,
  paymentResource,
  recordProviderPaymentEventAction,
  type RecordProviderPaymentEventRequest,
  type RecordProviderPaymentEventResponse,
} from "./models";
import type { PaymentGateway, ProviderPaymentEvent } from "./ports/payment-gateway";
import type { PaymentRepository } from "./ports/payment-repository";

export type RecordProviderPaymentEventDependencies = {
  readonly payments: PaymentRepository;
  readonly paymentsScopedTo: (tenantId: TenantId) => PaymentRepository;
  readonly gateway: PaymentGateway;
  readonly auditScopedTo: (tenantId: TenantId) => AuditTrail;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: OutboxWriter;
  readonly idempotency: IdempotencyStore;
  readonly provider: string;
};

export type RecordProviderPaymentEvent = (
  request: RecordProviderPaymentEventRequest,
) => Promise<Result<RecordProviderPaymentEventResponse, DomainError>>;

function unmatchedResponse(event: ProviderPaymentEvent): RecordProviderPaymentEventResponse {
  return { applied: false, replayed: false, paymentId: event.paymentId, status: undefined, kind: event.kind };
}

function replayedResponse(event: ProviderPaymentEvent): RecordProviderPaymentEventResponse {
  return { applied: false, replayed: true, paymentId: event.paymentId, status: undefined, kind: event.kind };
}

function resolvePaymentId(candidate: string | undefined): EntityId | undefined {
  if (!candidate) return undefined;
  const parsed = parseEntityId(candidate);
  return isOk(parsed) ? parsed.value : undefined;
}

function applyTransition(payment: Payment, event: ProviderPaymentEvent, at: Date): Result<PaymentTransition, DomainError> {
  if (event.kind === "succeeded") {
    if (!event.amount) {
      return err(
        invariantViolation(paymentEventAmountMissingCode, "A succeeded payment event must carry the paid amount"),
      );
    }
    return payment.settle(event.providerReference, event.amount, at);
  }
  if (event.kind === "failed") {
    return payment.fail(event.reason ?? paymentEventReasonMissingCode, at);
  }
  return payment.cancel(at);
}

export function recordProviderPaymentEvent(
  dependencies: RecordProviderPaymentEventDependencies,
): RecordProviderPaymentEvent {
  const {
    payments,
    paymentsScopedTo,
    gateway,
    auditScopedTo,
    permissions,
    clock,
    unitOfWork,
    outbox,
    idempotency,
    provider,
  } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: recordProviderPaymentEventAction,
      resource: paymentResource,
    });
    if (isErr(authorization)) return authorization;

    const interpreted = await gateway.interpret(request.notification);
    if (isErr(interpreted)) return interpreted;

    const event = interpreted.value;
    if (event.kind === "unsupported") {
      return ok(unmatchedResponse(event));
    }

    const idempotencyKey = { scope: `billing.providerEvent:${provider}`, key: event.providerEventId };
    const existing = await idempotency.find(idempotencyKey);
    if (existing) return ok(replayedResponse(event));

    const paymentId = resolvePaymentId(event.paymentId);
    if (!paymentId) return ok(unmatchedResponse(event));

    const payment = await payments.findById(paymentId);
    if (!payment) return ok(unmatchedResponse(event));

    if (event.tenantId !== undefined && event.tenantId !== payment.tenantId) {
      return err(
        forbidden(
          paymentNotificationTenantMismatchCode,
          "A provider notification's tenant does not match the tenant of the payment it resolved to",
        ),
      );
    }

    const scopedPayments = paymentsScopedTo(payment.tenantId);

    const outcome = await unitOfWork.run(
      { kind: "tenant", tenantId: payment.tenantId },
      async (): Promise<Result<RecordProviderPaymentEventResponse, DomainError>> => {
        const locked = await scopedPayments.findByIdForUpdate(paymentId);
        if (!locked) return ok(unmatchedResponse(event));

        const transition = applyTransition(locked, event, clock.now());
        if (isErr(transition)) return transition;

        await scopedPayments.save(locked);
        await outbox.enqueue(locked.pullEvents());
        await auditScopedTo(locked.tenantId).record({
          tenantId: locked.tenantId,
          occurredAt: clock.now(),
          actorId: request.actor.subjectId,
          actorKind: request.actor.kind,
          action: recordProviderPaymentEventAction,
          resourceType: "payment",
          resourceId: locked.id,
        });

        return ok({
          applied: transition.value === "applied",
          replayed: false,
          paymentId: locked.id,
          status: locked.status,
          kind: event.kind,
        });
      },
    );

    if (isErr(outcome)) return outcome;
    if (outcome.value.status === undefined) return outcome;

    await idempotency.save({
      ...idempotencyKey,
      fingerprint: event.providerEventId,
      reply: { status: 200, body: "" },
    });

    return outcome;
  };
}
