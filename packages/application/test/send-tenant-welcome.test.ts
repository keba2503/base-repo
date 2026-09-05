import { describe, expect, it } from "bun:test";
import { isErr, isOk, Tenant } from "@base/domain";
import { sendTenantWelcome, type EventHandler, type MailMessage, type TenantResponse } from "../src/index";
import { tenantIdFactory } from "./factories/actor";
import { eventFactory } from "./factories/event";
import { providerOutage, StubMailer, StubTenantRepository } from "./doubles/ports";

const createdAt = new Date("2026-01-15T10:00:00.000Z");

function messageOf(response: TenantResponse): MailMessage {
  return {
    to: "owner@example.com",
    subject: `Welcome ${response.name}`,
    html: `<p>${response.slug}</p>`,
    text: response.slug,
  };
}

type Harness = {
  handler: EventHandler;
  mailer: StubMailer;
  presented: TenantResponse[];
};

function harnessFactory(): Harness {
  const tenants = new StubTenantRepository();
  const tenant = Tenant.create({ id: tenantIdFactory(1), name: "Acme Clinic", slug: "acme-clinic", createdAt });
  if (!isOk(tenant)) throw new Error("Expected a valid tenant");
  tenants.seed(tenant.value);

  const mailer = new StubMailer();
  const presented: TenantResponse[] = [];
  const handler = sendTenantWelcome({
    tenants,
    mailer,
    presentMessage: (response) => {
      presented.push(response);
      return messageOf(response);
    },
  });
  return { handler, mailer, presented };
}

describe("send tenant welcome", () => {
  it("handles the tenant created event", () => {
    expect(harnessFactory().handler.eventName).toBe("tenant.created");
  });

  it("hands the stored tenant to the message factory", async () => {
    const harness = harnessFactory();
    await harness.handler.handle(eventFactory());
    expect(harness.presented).toEqual([
      { id: tenantIdFactory(1), name: "Acme Clinic", slug: "acme-clinic", createdAt },
    ]);
  });

  it("sends the message produced by the factory", async () => {
    const harness = harnessFactory();
    await harness.handler.handle(eventFactory());
    expect(harness.mailer.sent).toEqual([
      { to: "owner@example.com", subject: "Welcome Acme Clinic", html: "<p>acme-clinic</p>", text: "acme-clinic" },
    ]);
  });

  it("succeeds when the mailer accepts the message", async () => {
    const harness = harnessFactory();
    expect(isOk(await harness.handler.handle(eventFactory()))).toBe(true);
  });

  it("reports a missing tenant as not found", async () => {
    const harness = harnessFactory();
    const result = await harness.handler.handle(eventFactory({ tenantId: tenantIdFactory(42) }));
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.kind).toBe("notFound");
  });

  it("sends nothing for a missing tenant", async () => {
    const harness = harnessFactory();
    await harness.handler.handle(eventFactory({ tenantId: tenantIdFactory(42) }));
    expect(harness.mailer.sent).toEqual([]);
  });

  it("passes the mailer failure through", async () => {
    const harness = harnessFactory();
    harness.mailer.failWith(providerOutage());
    const result = await harness.handler.handle(eventFactory());
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.code).toBe("mail.provider.unavailable");
  });
});
