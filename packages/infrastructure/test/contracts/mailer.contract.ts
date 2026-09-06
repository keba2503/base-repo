import { describe, expect, it } from "bun:test";
import type { Mailer, MailMessage } from "@base/application";
import { isErr, isOk } from "@base/domain";

export type MailerHarness = {
  readonly mailer: Mailer;
  readonly recipient: string;
};

function untaggedMessageFactory(to: string): MailMessage {
  return {
    to,
    subject: "Acme Clinic is created",
    html: "<p>Acme Clinic is ready.</p>",
    text: "Acme Clinic is ready.",
  };
}

function messageFactory(to: string): MailMessage {
  return { ...untaggedMessageFactory(to), tags: { category: "tenant-welcome" } };
}

export function describeMailerContract(name: string, createHarness: () => MailerHarness): void {
  describe(`${name} satisfies the Mailer contract`, () => {
    it("accepts a well formed message", async () => {
      const harness = createHarness();
      expect(isOk(await harness.mailer.send(messageFactory(harness.recipient)))).toBe(true);
    });

    it("accepts a message without tags", async () => {
      const harness = createHarness();
      expect(isOk(await harness.mailer.send(untaggedMessageFactory(harness.recipient)))).toBe(true);
    });

    it("rejects a malformed recipient", async () => {
      const harness = createHarness();
      expect(isErr(await harness.mailer.send(messageFactory("not-an-address")))).toBe(true);
    });

    it("classifies a malformed recipient as a message problem", async () => {
      const harness = createHarness();
      const result = await harness.mailer.send(messageFactory("not-an-address"));
      if (!isErr(result)) throw new Error("Expected a failure");
      expect([result.error.kind, result.error.code]).toEqual(["invariantViolation", "mail.message.invalid"]);
    });
  });
}
