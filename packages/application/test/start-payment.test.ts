import { beforeEach, describe, expect, it } from "bun:test";
import { err, isErr, isOk, ok, unavailable, type DomainError, type EntityId, type Result } from "@base/domain";
import {
  paymentProviderUnavailableCode,
  startPayment,
  type StartPayment,
  type StartPaymentResponse,
} from "../src/index";
import { actorFactory } from "./factories/actor";
import { paymentHandoffFactory, providerPaymentEventFactory } from "./factories/payment";
import {
  StubAuditTrail,
  StubClock,
  StubIdGenerator,
  StubOutbox,
  StubPermissions,
  StubUnitOfWork,
} from "./doubles/ports";
import { StubPaymentGateway, StubPaymentRepository } from "./doubles/billing-ports";

const createdAt = new Date("2026-01-15T10:00:00.000Z");

function returnUrlsFor(paymentId: EntityId) {
  return {
    returnUrl: `https://app.example.com/payments/${paymentId}/return`,
    cancelUrl: `https://app.example.com/payments/${paymentId}/cancel`,
  };
}

type Harness = {
  useCase: StartPayment;
  payments: StubPaymentRepository;
  gateway: StubPaymentGateway;
  audit: StubAuditTrail;
  outbox: StubOutbox;
  unitOfWork: StubUnitOfWork;
  permissions: StubPermissions;
};

function harnessFactory(granted: readonly string[] = ["payments:start"]): Harness {
  const payments = new StubPaymentRepository();
  const gateway = new StubPaymentGateway(ok(paymentHandoffFactory()), ok(providerPaymentEventFactory({ kind: "unsupported" })));
  const audit = new StubAuditTrail();
  const outbox = new StubOutbox();
  const unitOfWork = new StubUnitOfWork();
  const permissions = new StubPermissions(granted);
  const useCase = startPayment({
    paymentsScopedTo: () => payments,
    gateway,
    auditScopedTo: () => audit,
    permissions,
    clock: new StubClock(createdAt),
    idGenerator: new StubIdGenerator(),
    unitOfWork,
    outbox,
    returnUrlsFor,
    provider: "stripe",
  });
  return { useCase, payments, gateway, audit, outbox, unitOfWork, permissions };
}

function expectOk(result: Result<StartPaymentResponse, DomainError>): StartPaymentResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

function expectErr(result: Result<StartPaymentResponse, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

const request = { actor: actorFactory(), amountMinor: 1_999, currency: "EUR", description: "Membership renewal" };

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("starting a payment", () => {
  it("returns the handoff produced by the gateway", async () => {
    const response = expectOk(await harness.useCase(request));
    expect(response.handoff).toEqual(paymentHandoffFactory());
  });

  it("returns the payment as pending", async () => {
    const response = expectOk(await harness.useCase(request));
    expect(response.status).toBe("pending");
  });

  it("persists the payment", async () => {
    await harness.useCase(request);
    expect(harness.payments.saved).toHaveLength(1);
  });

  it("stores the provider reference returned by the gateway", async () => {
    await harness.useCase(request);
    expect(harness.payments.saved[0]?.providerReference).toBe("provider-ref-1");
  });

  it("persists across two units of work", async () => {
    await harness.useCase(request);
    expect(harness.unitOfWork.runs).toBe(2);
  });

  it("enqueues the started event", async () => {
    await harness.useCase(request);
    expect(harness.outbox.events.map((event) => event.name)).toEqual(["payment.started"]);
  });

  it("asks the permissions port before acting", async () => {
    await harness.useCase(request);
    expect(harness.permissions.requests.map((entry) => entry.action)).toEqual(["payments:start"]);
  });

  it("builds the return and cancel urls from the payment id, never from the caller", async () => {
    await harness.useCase(request);
    const [instruction] = harness.gateway.startRequests;
    const [payment] = harness.payments.saved;
    if (payment === undefined) throw new Error("Expected a saved payment");
    expect(instruction?.returnUrl).toBe(`https://app.example.com/payments/${payment.id}/return`);
    expect(instruction?.cancelUrl).toBe(`https://app.example.com/payments/${payment.id}/cancel`);
  });

  it("derives the idempotency key deterministically from the payment id", async () => {
    await harness.useCase(request);
    const [instruction] = harness.gateway.startRequests;
    const [payment] = harness.payments.saved;
    if (payment === undefined) throw new Error("Expected a saved payment");
    expect(instruction?.idempotencyKey).toBe(`payment.start:${payment.id}`);
  });

  it("writes an audit entry for starting the payment", async () => {
    await harness.useCase(request);
    expect(harness.audit.entries.map((entry) => entry.action)).toEqual(["payments:start"]);
  });
});

describe("rejecting a payment start", () => {
  it("refuses an actor without the start permission", async () => {
    const denied = harnessFactory([]);
    const error = expectErr(await denied.useCase(request));
    expect(error.kind).toBe("forbidden");
  });

  it("touches nothing when the actor is not allowed", async () => {
    const denied = harnessFactory([]);
    await denied.useCase(request);
    expect(denied.payments.saved).toEqual([]);
    expect(denied.gateway.startRequests).toEqual([]);
    expect(denied.unitOfWork.runs).toBe(0);
  });

  it("refuses an amount that breaks the domain invariant", async () => {
    const error = expectErr(await harness.useCase({ ...request, amountMinor: 0 }));
    expect(error.code).toBe("money.amountMinor.notPositive");
  });

  it("refuses a description that breaks the domain invariant", async () => {
    const error = expectErr(await harness.useCase({ ...request, description: " " }));
    expect(error.code).toBe("payment.description.length");
  });

  it("writes nothing when the domain rejects the payment", async () => {
    await harness.useCase({ ...request, amountMinor: 0 });
    expect(harness.payments.saved).toEqual([]);
    expect(harness.gateway.startRequests).toEqual([]);
  });
});

describe("when the gateway is unavailable", () => {
  function unavailableHarness(): Harness {
    const built = harnessFactory();
    built.gateway.resolveStartWith(err(unavailable(paymentProviderUnavailableCode, "The provider timed out")));
    return built;
  }

  it("surfaces the gateway failure", async () => {
    const failing = unavailableHarness();
    const error = expectErr(await failing.useCase(request));
    expect(error.code).toBe(paymentProviderUnavailableCode);
  });

  it("leaves the payment pending rather than marking it failed", async () => {
    const failing = unavailableHarness();
    await failing.useCase(request);
    expect(failing.payments.saved[0]?.status).toBe("pending");
  });

  it("runs only the first unit of work, never the second", async () => {
    const failing = unavailableHarness();
    await failing.useCase(request);
    expect(failing.unitOfWork.runs).toBe(1);
  });
});
