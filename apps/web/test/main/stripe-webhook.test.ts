import { describe, expect, it } from "bun:test";
import type { InMemoryPaymentGateway } from "@base/infrastructure";
import { defaultModuleActivation, type ModuleActivation } from "@/main/api";
import { stripeWebhookHandler } from "@/main/stripe-webhook";
import { sharedContainer } from "@/main/use-cases";

function activationWith(overrides: Partial<ModuleActivation>): ModuleActivation {
  return { ...defaultModuleActivation, ...overrides };
}

const webhookUrl = "https://app.example.com/api/billing/stripe/webhook";

function paymentGatewayUnderTest(): InMemoryPaymentGateway {
  return sharedContainer().paymentGateway as InMemoryPaymentGateway;
}

type NotificationFixture = Parameters<InMemoryPaymentGateway["buildNotification"]>[1];

function fixtureFor(paymentId: string): NotificationFixture {
  return {
    paymentId: paymentId as unknown as NotificationFixture["paymentId"],
    providerReference: "pi_stripe_webhook_test",
  };
}

function postWebhook(
  rawBody: string,
  signature: string,
  modules: ModuleActivation,
): Promise<Response> {
  return stripeWebhookHandler(
    new Request(webhookUrl, {
      method: "POST",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      body: rawBody,
    }),
    modules,
  );
}

describe("the stripe webhook route with the billing module inactive", () => {
  it("answers 404 without reaching the payment gateway", async () => {
    const gateway = paymentGatewayUnderTest();
    const notification = gateway.buildNotification("succeeded", fixtureFor("00000000-0000-4000-8000-000000000050"));
    const response = await postWebhook(
      notification.rawBody,
      notification.signature,
      activationWith({ billing: false }),
    );
    expect(response.status).toBe(404);
  });
});

describe("the stripe webhook route with the billing module active", () => {
  const modules = activationWith({ billing: true });

  it("answers 200 for a validly signed notification", async () => {
    const gateway = paymentGatewayUnderTest();
    const notification = gateway.buildNotification("succeeded", fixtureFor("00000000-0000-4000-8000-000000000051"));
    const response = await postWebhook(notification.rawBody, notification.signature, modules);
    expect(response.status).toBe(200);
  });

  it("answers 403 for a tampered signature without touching a payment", async () => {
    const gateway = paymentGatewayUnderTest();
    const notification = gateway.buildTamperedNotification(
      "succeeded",
      fixtureFor("00000000-0000-4000-8000-000000000052"),
    );
    const response = await postWebhook(notification.rawBody, notification.signature, modules);
    expect(response.status).toBe(403);
  });

  it("refuses a body over the size cap before verifying anything", async () => {
    const oversizedBody = "a".repeat(1024 * 1024 + 1);
    const response = await postWebhook(oversizedBody, "t=1,v1=irrelevant", modules);
    expect(response.status).toBe(422);
  });
});
