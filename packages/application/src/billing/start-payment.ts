import {
  isErr,
  Money,
  ok,
  Payment,
  type DomainError,
  type EntityId,
  type Result,
  type TenantId,
} from "@base/domain";
import type { AuditTrail } from "../audit/ports/audit-trail";
import { authorize } from "../kernel/authorize";
import type { Clock } from "../kernel/ports/clock";
import type { IdGenerator } from "../kernel/ports/id-generator";
import type { OutboxWriter } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import {
  paymentResource,
  startPaymentAction,
  type PaymentReturnUrlFactory,
  type StartPaymentRequest,
  type StartPaymentResponse,
} from "./models";
import type { PaymentGateway } from "./ports/payment-gateway";
import type { PaymentRepository } from "./ports/payment-repository";

export type StartPaymentDependencies = {
  readonly paymentsScopedTo: (tenantId: TenantId) => PaymentRepository;
  readonly gateway: PaymentGateway;
  readonly auditScopedTo: (tenantId: TenantId) => AuditTrail;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: OutboxWriter;
  readonly returnUrlsFor: PaymentReturnUrlFactory;
  readonly provider: string;
};

export type StartPayment = (request: StartPaymentRequest) => Promise<Result<StartPaymentResponse, DomainError>>;

function idempotencyKeyFor(paymentId: EntityId): string {
  return `payment.start:${paymentId}`;
}

function withProviderReference(payment: Payment, providerReference: string): Result<Payment, DomainError> {
  return Payment.restore({ ...payment.toSnapshot(), providerReference });
}

export function startPayment(dependencies: StartPaymentDependencies): StartPayment {
  const {
    paymentsScopedTo,
    gateway,
    auditScopedTo,
    permissions,
    clock,
    idGenerator,
    unitOfWork,
    outbox,
    returnUrlsFor,
    provider,
  } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: startPaymentAction,
      resource: paymentResource,
    });
    if (isErr(authorization)) return authorization;

    const amount = Money.create(request.amountMinor, request.currency);
    if (isErr(amount)) return amount;

    const created = Payment.create({
      id: idGenerator.next(),
      tenantId: request.actor.tenantId,
      initiatedBy: request.actor.subjectId,
      amountMinor: amount.value.amountMinor,
      currency: amount.value.currency,
      description: request.description,
      provider,
      createdAt: clock.now(),
    });
    if (isErr(created)) return created;

    const payment = created.value;
    const payments = paymentsScopedTo(request.actor.tenantId);
    await unitOfWork.run({ kind: "tenant", tenantId: request.actor.tenantId }, async () => {
      await payments.save(payment);
      await outbox.enqueue(payment.pullEvents());
      await auditScopedTo(request.actor.tenantId).record({
        tenantId: request.actor.tenantId,
        occurredAt: clock.now(),
        actorId: request.actor.subjectId,
        actorKind: request.actor.kind,
        action: startPaymentAction,
        resourceType: "payment",
        resourceId: payment.id,
      });
    });

    const urls = returnUrlsFor(payment.id);
    const handoff = await gateway.start({
      paymentId: payment.id,
      tenantId: payment.tenantId,
      amount: payment.money,
      description: payment.description,
      returnUrl: urls.returnUrl,
      cancelUrl: urls.cancelUrl,
      idempotencyKey: idempotencyKeyFor(payment.id),
    });
    if (isErr(handoff)) return handoff;

    const withReference = withProviderReference(payment, handoff.value.providerReference);
    if (isErr(withReference)) return withReference;

    await unitOfWork.run({ kind: "tenant", tenantId: request.actor.tenantId }, async () => {
      await payments.save(withReference.value);
    });

    return ok({ paymentId: payment.id, status: payment.status, handoff: handoff.value });
  };
}
