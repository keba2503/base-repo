import { beforeEach, describe, expect, it } from "bun:test";
import { isErr, isOk, ok, type DomainError, type Result } from "@base/domain";
import {
  recordProviderPaymentEvent,
  type RecordProviderPaymentEvent,
  type RecordProviderPaymentEventResponse,
} from "../src/index";
import { actorFactory } from "./factories/actor";
import { entityIdFactory } from "./factories/identity";
import {
  moneyFactory,
  paymentFactory,
  paymentHandoffFactory,
  providerNotificationFactory,
  providerPaymentEventFactory,
} from "./factories/payment";
import { StubAuditTrail, StubClock, StubIdempotencyStore, StubOutbox, StubPermissions, StubUnitOfWork } from "./doubles/ports";
import { StubPaymentGateway, StubPaymentRepository } from "./doubles/billing-ports";

const occurredAt = new Date("2026-01-15T10:05:00.000Z");

type Harness = {
  useCase: RecordProviderPaymentEvent;
  payments: StubPaymentRepository;
  gateway: StubPaymentGateway;
  audit: StubAuditTrail;
  outbox: StubOutbox;
  unitOfWork: StubUnitOfWork;
  idempotency: StubIdempotencyStore;
  permissions: StubPermissions;
};

function harnessFactory(granted: readonly string[] = ["payments:recordProviderEvent"]): Harness {
  const payments = new StubPaymentRepository();
  const gateway = new StubPaymentGateway(ok(paymentHandoffFactory()), ok(providerPaymentEventFactory()));
  const audit = new StubAuditTrail();
  const outbox = new StubOutbox();
  const unitOfWork = new StubUnitOfWork();
  const idempotency = new StubIdempotencyStore();
  const permissions = new StubPermissions(granted);
  const useCase = recordProviderPaymentEvent({
    paymentsScopedTo: () => payments,
    gateway,
    auditScopedTo: () => audit,
    permissions,
    clock: new StubClock(occurredAt),
    unitOfWork,
    outbox,
    idempotency,
    provider: "stripe",
  });
  return { useCase, payments, gateway, audit, outbox, unitOfWork, idempotency, permissions };
}

function expectOk(result: Result<RecordProviderPaymentEventResponse, DomainError>): RecordProviderPaymentEventResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

function expectErr(result: Result<RecordProviderPaymentEventResponse, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

const request = { actor: actorFactory(), notification: providerNotificationFactory() };

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("recording a successful provider event", () => {
  beforeEach(() => {
    harness.payments.seed(paymentFactory());
    harness.gateway.resolveInterpretWith(
      ok(providerPaymentEventFactory({ paymentId: paymentFactory().id, providerReference: "provider-ref-9" })),
    );
  });

  it("applies the settlement", async () => {
    const response = expectOk(await harness.useCase(request));
    expect(response).toEqual({
      applied: true,
      replayed: false,
      paymentId: paymentFactory().id,
      status: "succeeded",
      kind: "succeeded",
    });
  });

  it("persists inside a single unit of work", async () => {
    await harness.useCase(request);
    expect(harness.unitOfWork.runs).toBe(1);
  });

  it("enqueues the succeeded event", async () => {
    await harness.useCase(request);
    expect(harness.outbox.events.map((event) => event.name)).toEqual(["payment.succeeded"]);
  });

  it("writes an audit entry", async () => {
    await harness.useCase(request);
    expect(harness.audit.entries.map((entry) => entry.action)).toEqual(["payments:recordProviderEvent"]);
  });

  it("records the idempotency key of the provider event", async () => {
    await harness.useCase(request);
    expect(harness.idempotency.size).toBe(1);
  });

  it("asks the permissions port before acting", async () => {
    await harness.useCase(request);
    expect(harness.permissions.requests.map((entry) => entry.action)).toEqual(["payments:recordProviderEvent"]);
  });
});

describe("refusing to record", () => {
  it("refuses an actor without the record permission", async () => {
    const denied = harnessFactory([]);
    const error = expectErr(await denied.useCase(request));
    expect(error.kind).toBe("forbidden");
  });

  it("touches nothing when the actor is not allowed, not even the gateway", async () => {
    const denied = harnessFactory([]);
    await denied.useCase(request);
    expect(denied.gateway.interpretRequests).toEqual([]);
    expect(denied.unitOfWork.runs).toBe(0);
  });
});

describe("an unsupported provider event", () => {
  it("is acknowledged as a success", async () => {
    harness.gateway.resolveInterpretWith(ok(providerPaymentEventFactory({ kind: "unsupported" })));
    const response = expectOk(await harness.useCase(request));
    expect(response.kind).toBe("unsupported");
    expect(response.applied).toBe(false);
  });

  it("touches no aggregate", async () => {
    harness.gateway.resolveInterpretWith(ok(providerPaymentEventFactory({ kind: "unsupported" })));
    await harness.useCase(request);
    expect(harness.unitOfWork.runs).toBe(0);
    expect(harness.payments.saved).toEqual([]);
  });

  it("writes no idempotency record", async () => {
    harness.gateway.resolveInterpretWith(ok(providerPaymentEventFactory({ kind: "unsupported" })));
    await harness.useCase(request);
    expect(harness.idempotency.size).toBe(0);
  });
});

describe("a duplicate provider event", () => {
  function seeded(): Harness {
    const built = harnessFactory();
    const payment = paymentFactory();
    built.payments.seed(payment);
    built.gateway.resolveInterpretWith(
      ok(providerPaymentEventFactory({ paymentId: payment.id, providerReference: "provider-ref-9" })),
    );
    return built;
  }

  it("applies nothing the second time", async () => {
    const built = seeded();
    await built.useCase(request);
    const response = expectOk(await built.useCase(request));
    expect(response.applied).toBe(false);
    expect(response.replayed).toBe(true);
  });

  it("runs the unit of work only once", async () => {
    const built = seeded();
    await built.useCase(request);
    await built.useCase(request);
    expect(built.unitOfWork.runs).toBe(1);
  });
});

describe("an event whose payment id is unknown", () => {
  it("reports it as unmatched instead of applying anything", async () => {
    harness.gateway.resolveInterpretWith(
      ok(providerPaymentEventFactory({ paymentId: entityIdFactory(999), providerReference: "provider-ref-9" })),
    );
    const response = expectOk(await harness.useCase(request));
    expect(response.applied).toBe(false);
    expect(response.replayed).toBe(false);
    expect(response.status).toBeUndefined();
  });

  it("writes nothing", async () => {
    harness.gateway.resolveInterpretWith(
      ok(providerPaymentEventFactory({ paymentId: entityIdFactory(999), providerReference: "provider-ref-9" })),
    );
    await harness.useCase(request);
    expect(harness.unitOfWork.runs).toBe(0);
    expect(harness.idempotency.size).toBe(0);
  });
});

describe("a settlement whose amount does not match", () => {
  beforeEach(() => {
    const payment = paymentFactory();
    harness.payments.seed(payment);
    harness.gateway.resolveInterpretWith(
      ok(
        providerPaymentEventFactory({
          paymentId: payment.id,
          providerReference: "provider-ref-9",
          amount: moneyFactory(500, "EUR"),
        }),
      ),
    );
  });

  it("is refused by the aggregate and surfaced by the use case", async () => {
    const error = expectErr(await harness.useCase(request));
    expect(error.code).toBe("payment.settle.amountMismatch");
  });

  it("writes nothing", async () => {
    await harness.useCase(request);
    expect(harness.unitOfWork.runs).toBe(0);
    expect(harness.idempotency.size).toBe(0);
  });
});
