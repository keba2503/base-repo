import { describe, expect, it } from "bun:test";
import type { StartPayment } from "@base/application";
import { conflict, err, forbidden, invariantViolation, notFound, ok, unavailable } from "@base/domain";
import { startPaymentController } from "../src/index";
import { actorFactory } from "./factories/actor";
import { startPaymentResponseFactory } from "./factories/start-payment-response";

const validPayload = { amountMinor: 2_500, currency: "EUR", description: "Consultation" };

function controllerOver(useCase: StartPayment) {
  return startPaymentController(useCase);
}

const succeedingUseCase: StartPayment = () => Promise.resolve(ok(startPaymentResponseFactory()));

describe("start payment controller", () => {
  it("never reaches the use case with an invalid payload", async () => {
    let calls = 0;
    const useCase: StartPayment = () => {
      calls += 1;
      return Promise.resolve(ok(startPaymentResponseFactory()));
    };
    await controllerOver(useCase)({
      actor: actorFactory(),
      payload: { amountMinor: -5, currency: "EUR", description: "Consultation" },
    });
    expect(calls).toBe(0);
  });

  it("reports contract violations as invalid", async () => {
    const outcome = await controllerOver(succeedingUseCase)({
      actor: actorFactory(),
      payload: { amountMinor: 2_500, currency: "euro", description: "Consultation" },
    });
    if (outcome.kind !== "invalid") throw new Error("Expected an invalid outcome");
    expect(outcome.issues.map((issue) => issue.path)).toEqual(["currency"]);
  });

  it("hands the parsed input to the use case", async () => {
    const seen: unknown[] = [];
    const useCase: StartPayment = (request) => {
      seen.push({
        amountMinor: request.amountMinor,
        currency: request.currency,
        description: request.description,
      });
      return Promise.resolve(ok(startPaymentResponseFactory()));
    };
    await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(seen).toEqual([validPayload]);
  });

  it("answers with the amount the use case recorded, never the one the caller sent", async () => {
    const outcome = await controllerOver(succeedingUseCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome).toEqual({
      kind: "ok",
      value: {
        paymentId: "00000000-0000-4000-8000-000000000040",
        status: "pending",
        amountMinor: 1_999,
        currency: "EUR",
        handoff: {
          kind: "redirect",
          url: "https://provider.example/checkout/session_123",
          providerReference: "session_123",
          expiresAt: "2026-01-15T10:15:00.000Z",
        },
      },
    });
  });

  it("returns the response model on success with a form handoff", async () => {
    const useCase: StartPayment = () =>
      Promise.resolve(
        ok(
          startPaymentResponseFactory({
            handoff: {
              kind: "form",
              action: "https://provider.example/checkout/submit",
              fields: { sessionId: "session_123" },
              providerReference: "session_123",
              expiresAt: new Date("2026-01-15T10:15:00.000Z"),
            },
          }),
        ),
      );
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    if (outcome.kind !== "ok") throw new Error("Expected an ok outcome");
    expect(outcome.value.handoff).toEqual({
      kind: "form",
      action: "https://provider.example/checkout/submit",
      fields: { sessionId: "session_123" },
      providerReference: "session_123",
      expiresAt: "2026-01-15T10:15:00.000Z",
    });
  });

  it("maps a forbidden domain error to a forbidden outcome", async () => {
    const useCase: StartPayment = () => Promise.resolve(err(forbidden("authorization.denied", "denied")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("forbidden");
  });

  it("maps a conflict domain error to a conflict outcome", async () => {
    const useCase: StartPayment = () =>
      Promise.resolve(err(conflict("payment.idempotency.conflict", "already started with different parameters")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("conflict");
  });

  it("maps a not found domain error to a not found outcome", async () => {
    const useCase: StartPayment = () => Promise.resolve(err(notFound("payment.notFound", "missing")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("notFound");
  });

  it("maps an invariant violation to an invalid outcome carrying its code", async () => {
    const useCase: StartPayment = () =>
      Promise.resolve(err(invariantViolation("payment.instruction.invalid", "the provider rejected the instruction")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    if (outcome.kind !== "invalid") throw new Error("Expected an invalid outcome");
    expect(outcome.issues.map((issue) => issue.code)).toEqual(["payment.instruction.invalid"]);
  });

  it("maps an unavailable domain error to an unavailable outcome", async () => {
    const useCase: StartPayment = () =>
      Promise.resolve(err(unavailable("payment.provider.unavailable", "the provider is unreachable")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("unavailable");
  });
});
