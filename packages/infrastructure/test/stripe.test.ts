import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
  paymentIdempotencyConflictCode,
  paymentInstructionInvalidCode,
  paymentProviderMalformedResponseCode,
  paymentProviderUnavailableCode,
  type ProviderNotification,
} from "@base/application";
import { isErr, isOk } from "@base/domain";
import {
  createStripeClient,
  stripeApiVersion,
  StripePaymentGateway,
  type StripeFetchImplementation,
} from "@base/infrastructure";
import { describePaymentGatewayContract, type PaymentGatewayHarness, type PaymentNotificationFixture } from "./contracts/index";
import { startPaymentInstructionFactory } from "./factories/payment";

const secretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const testWebhookSecret = "stripe-webhook-secret-for-this-test-only";

function signatureHeaderFor(secret: string, timestampSeconds: number, rawBody: string): string {
  const digest = createHmac("sha256", secret).update(`${String(timestampSeconds)}.${rawBody}`).digest("hex");
  return `t=${String(timestampSeconds)},v1=${digest}`;
}

function checkoutSessionEventBody(
  kind: "succeeded" | "failed" | "canceled",
  eventId: string,
  createdSeconds: number,
  fixture: PaymentNotificationFixture,
): string {
  const object: Record<string, unknown> = {
    id: fixture.providerReference,
    metadata: { paymentId: fixture.paymentId, tenantId: fixture.tenantId },
  };
  let type = "checkout.session.expired";
  if (kind === "succeeded") {
    type = "checkout.session.completed";
    object.payment_status = "paid";
    object.amount_total = fixture.amount?.amountMinor;
    object.currency = fixture.amount?.currency.toLowerCase();
  }
  if (kind === "failed") {
    type = "checkout.session.async_payment_failed";
    object.last_payment_error = { code: fixture.reason ?? "card_declined" };
  }
  return JSON.stringify({ id: eventId, type, created: createdSeconds, data: { object } });
}

if (secretKey && webhookSecret) {
  const returnUrls = {
    returnUrl: "https://acme.example/billing/return",
    cancelUrl: "https://acme.example/billing/cancel",
  };

  describePaymentGatewayContract("StripePaymentGateway", (): PaymentGatewayHarness => {
    const gateway = new StripePaymentGateway({ client: createStripeClient({ secretKey }), webhookSecret });
    const instruction = startPaymentInstructionFactory({
      ...returnUrls,
      idempotencyKey: `payment.start:stripe-contract-${randomUUID()}`,
    });
    let eventSequence = 0;
    const nextEventId = (): string => {
      eventSequence += 1;
      return `evt_${String(eventSequence)}_${randomUUID().replace(/-/g, "")}`;
    };

    return {
      gateway,
      instruction,
      notificationOf(kind, fixture) {
        const now = new Date();
        const timestampSeconds = Math.floor(now.getTime() / 1000);
        const rawBody = checkoutSessionEventBody(kind, nextEventId(), timestampSeconds, fixture);
        return {
          rawBody,
          signature: signatureHeaderFor(webhookSecret, timestampSeconds, rawBody),
          receivedAt: now,
        };
      },
      tamperedNotification(fixture) {
        const now = new Date();
        const timestampSeconds = Math.floor(now.getTime() / 1000);
        const rawBody = checkoutSessionEventBody("failed", nextEventId(), timestampSeconds, fixture);
        const validSignature = signatureHeaderFor(webhookSecret, timestampSeconds, rawBody);
        const [tPart, v1Part] = validSignature.split(",");
        const lastCharacter = String(v1Part).slice(-1);
        const tampered = `${String(v1Part).slice(0, -1)}${lastCharacter === "0" ? "1" : "0"}`;
        return { rawBody, signature: `${String(tPart)},${tampered}`, receivedAt: now };
      },
      staleNotification(fixture) {
        const now = new Date();
        const staleTimestampSeconds = Math.floor(now.getTime() / 1000) - 400;
        const rawBody = checkoutSessionEventBody("failed", nextEventId(), staleTimestampSeconds, fixture);
        return {
          rawBody,
          signature: signatureHeaderFor(webhookSecret, staleTimestampSeconds, rawBody),
          receivedAt: now,
        };
      },
      unsupportedNotification(fixture) {
        const now = new Date();
        const timestampSeconds = Math.floor(now.getTime() / 1000);
        const rawBody = JSON.stringify({
          id: nextEventId(),
          type: "charge.refunded",
          created: timestampSeconds,
          data: { object: { id: fixture.providerReference, metadata: { paymentId: fixture.paymentId } } },
        });
        return {
          rawBody,
          signature: signatureHeaderFor(webhookSecret, timestampSeconds, rawBody),
          receivedAt: now,
        };
      },
      malformedNotification() {
        const now = new Date();
        const timestampSeconds = Math.floor(now.getTime() / 1000);
        const rawBody = "not-a-stripe-event";
        return {
          rawBody,
          signature: signatureHeaderFor(webhookSecret, timestampSeconds, rawBody),
          receivedAt: now,
        };
      },
    };
  });
} else {
  const missing = [!secretKey ? "STRIPE_SECRET_KEY" : undefined, !webhookSecret ? "STRIPE_WEBHOOK_SECRET" : undefined]
    .filter((name): name is string => name !== undefined)
    .join(" and ");
  console.warn(`Skipping the StripePaymentGateway contract suite: set ${missing} to run it against Stripe`);
  describe.skip(`StripePaymentGateway satisfies the PaymentGateway contract (set ${missing} to run it)`, () => {
    it("runs only with STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET", () => {
      expect(secretKey && webhookSecret).toBeTruthy();
    });
  });
}

type FakeFetchCall = { readonly url: string; readonly init: RequestInit };

type FakeFetch = {
  readonly fetchImplementation: StripeFetchImplementation;
  readonly calls: FakeFetchCall[];
};

function fakeFetch(respond: () => Promise<Response>): FakeFetch {
  const calls: FakeFetchCall[] = [];
  return {
    calls,
    fetchImplementation(input, init) {
      calls.push({ url: input, init });
      return respond();
    },
  };
}

function neverRespondingFetch(): StripeFetchImplementation {
  return (_input, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const reason: unknown = init.signal?.reason;
        reject(reason instanceof Error ? reason : new Error("The fetch was aborted"));
      });
    });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function gatewayOver(fetchImplementation: StripeFetchImplementation, timeoutMilliseconds = 1_000): StripePaymentGateway {
  return new StripePaymentGateway({
    client: createStripeClient({ secretKey: "sk_test_fake", fetchImplementation, timeoutMilliseconds }),
    webhookSecret: testWebhookSecret,
  });
}

function searchParamsOf(body: RequestInit["body"]): URLSearchParams {
  if (body instanceof URLSearchParams) return body;
  throw new Error("Expected a URLSearchParams body");
}

describe("stripe payment gateway checkout session request", () => {
  it("sends the checkout session form encoded with the pinned headers", async () => {
    const fake = fakeFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          id: "cs_test_123",
          url: "https://checkout.stripe.com/pay/cs_test_123",
          expires_at: 1_893_456_000,
        }),
      ),
    );
    const instruction = startPaymentInstructionFactory();
    const result = await gatewayOver(fake.fetchImplementation).start(instruction);
    expect(isOk(result)).toBe(true);

    const [call] = fake.calls;
    if (!call) throw new Error("Expected a call");
    expect(call.url).toBe("https://api.stripe.com/v1/checkout/sessions");

    const headers = new Headers(call.init.headers);
    expect(headers.get("Authorization")).toBe("Bearer sk_test_fake");
    expect(headers.get("Stripe-Version")).toBe(stripeApiVersion);
    expect(headers.get("Idempotency-Key")).toBe(instruction.idempotencyKey);
    expect(headers.get("Content-Type")).toBe("application/x-www-form-urlencoded");

    const body = searchParamsOf(call.init.body);
    expect(body.get("mode")).toBe("payment");
    expect(body.get("success_url")).toBe(instruction.returnUrl);
    expect(body.get("cancel_url")).toBe(instruction.cancelUrl);
    expect(body.get("client_reference_id")).toBe(instruction.paymentId);
    expect(body.get("metadata[paymentId]")).toBe(instruction.paymentId);
    expect(body.get("metadata[tenantId]")).toBe(instruction.tenantId);
    expect(body.get("payment_intent_data[metadata][paymentId]")).toBe(instruction.paymentId);
    expect(body.get("payment_intent_data[metadata][tenantId]")).toBe(instruction.tenantId);
    expect(body.get("line_items[0][quantity]")).toBe("1");
    expect(body.get("line_items[0][price_data][currency]")).toBe(instruction.amount.currency.toLowerCase());
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe(String(instruction.amount.amountMinor));
    expect(body.get("line_items[0][price_data][product_data][name]")).toBe(instruction.description);
  });

  it("returns the checkout session as a redirect handoff", async () => {
    const fake = fakeFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          id: "cs_test_123",
          url: "https://checkout.stripe.com/pay/cs_test_123",
          expires_at: 1_893_456_000,
        }),
      ),
    );
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isOk(result)) throw new Error("Expected a handoff");
    expect(result.value).toEqual({
      kind: "redirect",
      url: "https://checkout.stripe.com/pay/cs_test_123",
      providerReference: "cs_test_123",
      expiresAt: new Date(1_893_456_000 * 1000),
    });
  });
});

describe("stripe payment gateway error translation", () => {
  it("reports a thrown network failure as unavailable", async () => {
    const fake = fakeFetch(() => Promise.reject(new Error("socket hang up")));
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.message]).toEqual(["unavailable", "socket hang up"]);
  });

  it("gives up when Stripe does not answer within the timeout", async () => {
    const result = await gatewayOver(neverRespondingFetch(), 5).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.code).toBe(paymentProviderUnavailableCode);
  });

  it("reports a 5xx response as unavailable", async () => {
    const fake = fakeFetch(() =>
      Promise.resolve(jsonResponse(500, { error: { type: "api_error", message: "internal problem" } })),
    );
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.code]).toEqual(["unavailable", paymentProviderUnavailableCode]);
  });

  it("reports a rate limit response as unavailable", async () => {
    const fake = fakeFetch(() =>
      Promise.resolve(jsonResponse(429, { error: { type: "rate_limit_error", message: "slow down" } })),
    );
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.code]).toEqual(["unavailable", paymentProviderUnavailableCode]);
  });

  it("reports a rejected credential as unavailable", async () => {
    const fake = fakeFetch(() =>
      Promise.resolve(jsonResponse(401, { error: { type: "authentication_error", message: "bad key" } })),
    );
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.code]).toEqual(["unavailable", paymentProviderUnavailableCode]);
  });

  it("reports a forbidden credential as unavailable", async () => {
    const fake = fakeFetch(() =>
      Promise.resolve(jsonResponse(403, { error: { type: "permission_error", message: "not allowed" } })),
    );
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.code]).toEqual(["unavailable", paymentProviderUnavailableCode]);
  });

  it("reports an invalid request as an instruction problem", async () => {
    const fake = fakeFetch(() =>
      Promise.resolve(jsonResponse(400, { error: { type: "invalid_request_error", message: "missing field" } })),
    );
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.code]).toEqual(["invariantViolation", paymentInstructionInvalidCode]);
  });

  it("reports an idempotency conflict", async () => {
    const fake = fakeFetch(() =>
      Promise.resolve(jsonResponse(400, { error: { type: "idempotency_error", message: "key reused" } })),
    );
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.code]).toEqual(["conflict", paymentIdempotencyConflictCode]);
  });

  it("reports a 2xx response missing the session fields as a malformed response", async () => {
    const fake = fakeFetch(() => Promise.resolve(jsonResponse(200, { id: "cs_test_123" })));
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.code]).toEqual(["unavailable", paymentProviderMalformedResponseCode]);
  });

  it("reports a 2xx response with an unparseable body as a malformed response", async () => {
    const fake = fakeFetch(() => Promise.resolve(new Response("not-json", { status: 200 })));
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.code]).toEqual(["unavailable", paymentProviderMalformedResponseCode]);
  });

  it("never leaks the provider message into the error", async () => {
    const fake = fakeFetch(() =>
      Promise.resolve(
        jsonResponse(402, { error: { type: "card_error", message: "Your card was declined for a very specific reason" } }),
      ),
    );
    const result = await gatewayOver(fake.fetchImplementation).start(startPaymentInstructionFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.message).not.toContain("Your card was declined for a very specific reason");
  });
});

describe("stripe payment gateway notification interpretation", () => {
  function notificationFor(
    kind: "succeeded" | "failed" | "canceled",
    fixture: PaymentNotificationFixture,
    secret = testWebhookSecret,
    timestampSeconds = Math.floor(Date.now() / 1000),
  ): ProviderNotification {
    const rawBody = checkoutSessionEventBody(kind, `evt_${randomUUID()}`, timestampSeconds, fixture);
    return { rawBody, signature: signatureHeaderFor(secret, timestampSeconds, rawBody), receivedAt: new Date() };
  }

  const gateway = new StripePaymentGateway({
    client: createStripeClient({ secretKey: "sk_test_fake" }),
    webhookSecret: testWebhookSecret,
  });
  const instruction = startPaymentInstructionFactory();

  it("interprets checkout.session.completed with a paid status as succeeded", async () => {
    const notification = notificationFor("succeeded", {
      paymentId: instruction.paymentId,
      providerReference: "cs_test_success",
      amount: instruction.amount,
    });
    const interpreted = await gateway.interpret(notification);
    if (!isOk(interpreted)) throw new Error(`Expected an event, received ${interpreted.error.code}`);
    expect(interpreted.value.kind).toBe("succeeded");
    expect(interpreted.value.providerReference).toBe("cs_test_success");
    expect(interpreted.value.amount).toEqual(instruction.amount);
  });

  it("interprets checkout.session.async_payment_failed as failed", async () => {
    const notification = notificationFor("failed", {
      paymentId: instruction.paymentId,
      providerReference: "cs_test_failed",
      reason: "card_declined",
    });
    const interpreted = await gateway.interpret(notification);
    if (!isOk(interpreted)) throw new Error(`Expected an event, received ${interpreted.error.code}`);
    expect(interpreted.value.kind).toBe("failed");
    expect(interpreted.value.reason).toBe("card_declined");
  });

  it("interprets payment_intent.payment_failed as failed and carries the tenant id from the payment intent metadata", async () => {
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "payment_intent.payment_failed",
      created: timestampSeconds,
      data: {
        object: {
          id: "pi_test_failed",
          metadata: { paymentId: instruction.paymentId, tenantId: instruction.tenantId },
          last_payment_error: { code: "insufficient_funds" },
        },
      },
    });
    const notification: ProviderNotification = {
      rawBody,
      signature: signatureHeaderFor(testWebhookSecret, timestampSeconds, rawBody),
      receivedAt: new Date(),
    };
    const interpreted = await gateway.interpret(notification);
    if (!isOk(interpreted)) throw new Error(`Expected an event, received ${interpreted.error.code}`);
    expect(interpreted.value.kind).toBe("failed");
    expect(interpreted.value.reason).toBe("insufficient_funds");
    expect(interpreted.value.tenantId).toBe(instruction.tenantId);
  });

  it("reads the tenant id from the event metadata", async () => {
    const notification = notificationFor("succeeded", {
      paymentId: instruction.paymentId,
      providerReference: "cs_test_tenant",
      amount: instruction.amount,
      tenantId: instruction.tenantId,
    });
    const interpreted = await gateway.interpret(notification);
    if (!isOk(interpreted)) throw new Error(`Expected an event, received ${interpreted.error.code}`);
    expect(interpreted.value.tenantId).toBe(instruction.tenantId);
  });

  it("leaves the tenant id undefined when the event carries none", async () => {
    const notification = notificationFor("succeeded", {
      paymentId: instruction.paymentId,
      providerReference: "cs_test_no_tenant",
      amount: instruction.amount,
    });
    const interpreted = await gateway.interpret(notification);
    if (!isOk(interpreted)) throw new Error(`Expected an event, received ${interpreted.error.code}`);
    expect(interpreted.value.tenantId).toBeUndefined();
  });

  it("interprets checkout.session.expired as canceled", async () => {
    const notification = notificationFor("canceled", {
      paymentId: instruction.paymentId,
      providerReference: "cs_test_canceled",
    });
    const interpreted = await gateway.interpret(notification);
    if (!isOk(interpreted)) throw new Error(`Expected an event, received ${interpreted.error.code}`);
    expect(interpreted.value.kind).toBe("canceled");
  });

  it("treats an event outside the mapped vocabulary as a successful, unsupported outcome", async () => {
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "charge.refunded",
      created: timestampSeconds,
      data: { object: { id: "ch_test_refunded", metadata: { paymentId: instruction.paymentId } } },
    });
    const notification: ProviderNotification = {
      rawBody,
      signature: signatureHeaderFor(testWebhookSecret, timestampSeconds, rawBody),
      receivedAt: new Date(),
    };
    const interpreted = await gateway.interpret(notification);
    if (!isOk(interpreted)) throw new Error(`Expected a success, received ${interpreted.error.code}`);
    expect(interpreted.value.kind).toBe("unsupported");
  });

  it("refuses a tampered signature", async () => {
    const notification = notificationFor("failed", {
      paymentId: instruction.paymentId,
      providerReference: "cs_test_tampered",
    });
    const [tPart, v1Part] = notification.signature.split(",");
    const lastCharacter = String(v1Part).slice(-1);
    const tampered = `${String(v1Part).slice(0, -1)}${lastCharacter === "0" ? "1" : "0"}`;
    const interpreted = await gateway.interpret({ ...notification, signature: `${String(tPart)},${tampered}` });
    if (!isErr(interpreted)) throw new Error("Expected a failure");
    expect(interpreted.error.kind).toBe("forbidden");
  });

  it("refuses a correctly signed but stale notification with the same failure as a tampered one", async () => {
    const staleTimestampSeconds = Math.floor(Date.now() / 1000) - 400;
    const notification = notificationFor(
      "failed",
      { paymentId: instruction.paymentId, providerReference: "cs_test_stale" },
      testWebhookSecret,
      staleTimestampSeconds,
    );
    const interpreted = await gateway.interpret(notification);
    if (!isErr(interpreted)) throw new Error("Expected a failure");
    const tampered = notificationFor("failed", {
      paymentId: instruction.paymentId,
      providerReference: "cs_test_tampered_compare",
    });
    const [tPart, v1Part] = tampered.signature.split(",");
    const lastCharacter = String(v1Part).slice(-1);
    const tamperedSignature = `${String(v1Part).slice(0, -1)}${lastCharacter === "0" ? "1" : "0"}`;
    const tamperedInterpreted = await gateway.interpret({
      ...tampered,
      signature: `${String(tPart)},${tamperedSignature}`,
    });
    if (!isErr(tamperedInterpreted)) throw new Error("Expected a failure");
    expect([interpreted.error.kind, interpreted.error.code]).toEqual([
      tamperedInterpreted.error.kind,
      tamperedInterpreted.error.code,
    ]);
  });

  it("classifies a body that is not the provider's shape as malformed", async () => {
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const rawBody = "not-a-stripe-event";
    const interpreted = await gateway.interpret({
      rawBody,
      signature: signatureHeaderFor(testWebhookSecret, timestampSeconds, rawBody),
      receivedAt: new Date(),
    });
    if (!isErr(interpreted)) throw new Error("Expected a failure");
    expect(interpreted.error.kind).toBe("invariantViolation");
  });
});
