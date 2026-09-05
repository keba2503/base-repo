import { describe, expect, it } from "bun:test";
import type { MailMessage } from "@base/application";
import { isErr, isOk } from "@base/domain";
import { createResendClient, ResendMailer, type ResendEmailClient } from "@base/infrastructure";
import type { CreateEmailOptions, CreateEmailResponse, ErrorResponse } from "resend";
import { describeMailerContract } from "./contracts/index";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.MAIL_FROM ?? "onboarding@resend.dev";
const resendTestRecipient = "delivered@resend.dev";

if (apiKey) {
  describeMailerContract("ResendMailer", () => ({
    mailer: new ResendMailer({ client: createResendClient({ apiKey }), from, timeoutMs: 10_000 }),
    recipient: resendTestRecipient,
  }));
} else {
  console.warn("Skipping the ResendMailer contract suite: set RESEND_API_KEY to run it against Resend");
  describe.skip("ResendMailer satisfies the Mailer contract (set RESEND_API_KEY to run it)", () => {
    it("runs only with RESEND_API_KEY", () => {
      expect(apiKey).toBeDefined();
    });
  });
}

const untagged: MailMessage = {
  to: "owner@example.com",
  subject: "Acme Clinic is created",
  html: "<p>Acme Clinic is ready.</p>",
  text: "Acme Clinic is ready.",
};

const welcome: MailMessage = { ...untagged, tags: { category: "tenant-welcome" } };

type FakeClient = {
  readonly client: ResendEmailClient;
  readonly payloads: CreateEmailOptions[];
};

function accepted(): CreateEmailResponse {
  return { data: { id: "email-1" }, error: null, headers: null };
}

function refused(name: ErrorResponse["name"]): CreateEmailResponse {
  return { data: null, error: { name, message: "refused", statusCode: 422 }, headers: null };
}

function fakeClient(answer: () => Promise<CreateEmailResponse>): FakeClient {
  const payloads: CreateEmailOptions[] = [];
  return {
    payloads,
    client: {
      emails: {
        send(payload) {
          payloads.push(payload);
          return answer();
        },
      },
    },
  };
}

function mailerOver(fake: FakeClient, timeoutMs = 1_000): ResendMailer {
  return new ResendMailer({ client: fake.client, from: "Base <hello@example.com>", timeoutMs });
}

describe("resend mailer payload", () => {
  it("sends the configured sender with the message fields", async () => {
    const fake = fakeClient(() => Promise.resolve(accepted()));
    await mailerOver(fake).send(welcome);
    expect(fake.payloads).toEqual([
      {
        from: "Base <hello@example.com>",
        to: "owner@example.com",
        subject: "Acme Clinic is created",
        html: "<p>Acme Clinic is ready.</p>",
        text: "Acme Clinic is ready.",
        tags: [{ name: "category", value: "tenant-welcome" }],
      },
    ]);
  });

  it("omits the tags when the message carries none", async () => {
    const fake = fakeClient(() => Promise.resolve(accepted()));
    await mailerOver(fake).send(untagged);
    expect(fake.payloads[0]).not.toHaveProperty("tags");
  });
});

describe("resend mailer outcome", () => {
  it("succeeds when Resend accepts the message", async () => {
    const fake = fakeClient(() => Promise.resolve(accepted()));
    expect(isOk(await mailerOver(fake).send(welcome))).toBe(true);
  });

  it("reports a validation error as a message problem", async () => {
    const fake = fakeClient(() => Promise.resolve(refused("validation_error")));
    const result = await mailerOver(fake).send(welcome);
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.code]).toEqual(["invariantViolation", "mail.message.invalid"]);
  });

  it("reports a provider error as unavailable", async () => {
    const fake = fakeClient(() => Promise.resolve(refused("internal_server_error")));
    const result = await mailerOver(fake).send(welcome);
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.code]).toEqual(["unavailable", "mail.provider.unavailable"]);
  });

  it("reports a rate limit as unavailable", async () => {
    const fake = fakeClient(() => Promise.resolve(refused("rate_limit_exceeded")));
    const result = await mailerOver(fake).send(welcome);
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.kind).toBe("unavailable");
  });

  it("reports a thrown network failure as unavailable", async () => {
    const fake = fakeClient(() => Promise.reject(new Error("socket hang up")));
    const result = await mailerOver(fake).send(welcome);
    if (!isErr(result)) throw new Error("Expected a failure");
    expect([result.error.kind, result.error.message]).toEqual(["unavailable", "socket hang up"]);
  });

  it("gives up when Resend does not answer within the timeout", async () => {
    const fake = fakeClient(() => new Promise<CreateEmailResponse>(() => undefined));
    const result = await mailerOver(fake, 5).send(welcome);
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.code).toBe("mail.provider.unavailable");
  });

  it("never leaks the provider message into the error", async () => {
    const fake = fakeClient(() => Promise.resolve(refused("invalid_api_key")));
    const result = await mailerOver(fake).send(welcome);
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.message).not.toContain("refused");
  });
});
