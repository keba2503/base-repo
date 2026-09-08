import { describe, expect, it } from "bun:test";
import { paymentProviderUnavailableCode } from "@base/application";
import { isErr, isOk } from "@base/domain";
import { FixedClock, InMemoryPaymentGateway } from "@base/infrastructure";
import { startPaymentInstructionFactory } from "./factories/payment";

const webhookSecret = "test-payment-webhook-secret-0123456789";
const baseUrl = "https://payments.example";

function gatewayFactory(): InMemoryPaymentGateway {
  return new InMemoryPaymentGateway({
    clock: new FixedClock(new Date("2026-01-15T10:00:00.000Z")),
    webhookSecret,
    baseUrl,
  });
}

describe("in memory payment gateway outage", () => {
  it("fails start with an unavailable error while an outage is simulated", async () => {
    const gateway = gatewayFactory();
    gateway.simulateOutage(true);
    const started = await gateway.start(startPaymentInstructionFactory());
    if (!isErr(started)) throw new Error("Expected a failure");
    expect(started.error.kind).toBe("unavailable");
    expect(started.error.code).toBe(paymentProviderUnavailableCode);
  });

  it("recovers once the outage is turned off", async () => {
    const gateway = gatewayFactory();
    gateway.simulateOutage(true);
    gateway.simulateOutage(false);
    const started = await gateway.start(startPaymentInstructionFactory());
    expect(isOk(started)).toBe(true);
  });

  it("fails interpret with an unavailable error while an outage is simulated", async () => {
    const gateway = gatewayFactory();
    const notification = gateway.buildNotification("succeeded", {
      paymentId: startPaymentInstructionFactory().paymentId,
      providerReference: "pi_outage_test",
    });
    gateway.simulateOutage(true);
    const interpreted = await gateway.interpret(notification);
    if (!isErr(interpreted)) throw new Error("Expected a failure");
    expect(interpreted.error.kind).toBe("unavailable");
    expect(interpreted.error.code).toBe(paymentProviderUnavailableCode);
  });
});
