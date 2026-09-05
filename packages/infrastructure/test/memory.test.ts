import { describe, expect, it } from "bun:test";
import {
  AllowAllPermissions,
  ConsoleLogger,
  ConsoleMailer,
  DenyAllPermissions,
  FixedClock,
  InMemoryMailer,
  InMemoryOutbox,
  InMemoryTenantRepository,
  InMemoryTenantStore,
  InMemoryUnitOfWork,
  RandomIdGenerator,
  redact,
  redactedMarker,
  ScopedPermissions,
  SequentialIdGenerator,
  SilentLogger,
  SystemClock,
  type LogSink,
} from "@base/infrastructure";
import type { LogFields, MailMessage } from "@base/application";
import {
  describeClockContract,
  describeIdGeneratorContract,
  describeLoggerContract,
  describeMailerContract,
  describeOutboxContract,
  describePermissionsContract,
  describeTenantRepositoryContract,
  describeUnitOfWorkContract,
} from "./contracts/index";

describeClockContract("SystemClock", () => new SystemClock());
describeClockContract("FixedClock", () => new FixedClock(new Date("2026-01-15T10:00:00.000Z")));

describeIdGeneratorContract("SequentialIdGenerator", () => new SequentialIdGenerator());
describeIdGeneratorContract("RandomIdGenerator", () => new RandomIdGenerator());

describePermissionsContract("AllowAllPermissions", () => new AllowAllPermissions());
describePermissionsContract("DenyAllPermissions", () => new DenyAllPermissions());
describePermissionsContract("ScopedPermissions", () => new ScopedPermissions());

describeUnitOfWorkContract("InMemoryUnitOfWork", () => new InMemoryUnitOfWork());

describeOutboxContract("InMemoryOutbox", () => {
  const outbox = new InMemoryOutbox();
  return { outbox, enqueued: () => Promise.resolve(outbox.enqueued) };
});

describeLoggerContract("SilentLogger", () => new SilentLogger());
describeLoggerContract("ConsoleLogger", () => new ConsoleLogger({ sink: recordingSink().sink }));

describeMailerContract("InMemoryMailer", () => ({ mailer: new InMemoryMailer(), recipient: "owner@example.com" }));
describeMailerContract("ConsoleMailer", () => ({
  mailer: new ConsoleMailer({ sink: () => undefined }),
  recipient: "owner@example.com",
}));

describeTenantRepositoryContract("InMemoryTenantRepository", () => {
  const store = new InMemoryTenantStore();
  return {
    registry: new InMemoryTenantRepository(store, { kind: "registry" }),
    scopedTo: (tenantId) => new InMemoryTenantRepository(store, { kind: "tenant", tenantId }),
  };
});

type RecordedLine = { readonly level: string; readonly message: string; readonly fields: LogFields };

function recordingSink(): { sink: LogSink; lines: RecordedLine[] } {
  const lines: RecordedLine[] = [];
  const sink: LogSink = {
    info: (message, fields) => lines.push({ level: "info", message, fields }),
    warn: (message, fields) => lines.push({ level: "warn", message, fields }),
    error: (message, fields) => lines.push({ level: "error", message, fields }),
  };
  return { sink, lines };
}

describe("field redaction", () => {
  it("keeps a field classified as none", () => {
    expect(redact({ slug: "none" }, { slug: "acme" })).toEqual({ slug: "acme" });
  });

  it("keeps a field the policy does not mention", () => {
    expect(redact({}, { attempt: 3 })).toEqual({ attempt: 3 });
  });

  it("hides a field classified as personal", () => {
    expect(redact({ name: "personal" }, { name: "Karen" })).toEqual({ name: redactedMarker });
  });

  it("hides a field classified as sensitive", () => {
    expect(redact({ diagnosis: "sensitive" }, { diagnosis: "asthma" })).toEqual({
      diagnosis: redactedMarker,
    });
  });
});

describe("console logger", () => {
  it("redacts personal fields before they reach the sink", () => {
    const recorder = recordingSink();
    const logger = new ConsoleLogger({ policy: { name: "personal" }, sink: recorder.sink });
    logger.info("tenant created", { name: "Karen", slug: "acme" });
    expect(recorder.lines).toEqual([
      { level: "info", message: "tenant created", fields: { name: redactedMarker, slug: "acme" } },
    ]);
  });
});

describe("fixed clock", () => {
  it("only moves when it is told to", () => {
    const clock = new FixedClock(new Date("2026-01-15T10:00:00.000Z"));
    const before = clock.now().getTime();
    clock.advanceBy(1000);
    expect(clock.now().getTime() - before).toBe(1000);
  });
});

describe("in memory outbox", () => {
  it("empties itself once drained", async () => {
    const outbox = new InMemoryOutbox();
    await outbox.enqueue([]);
    outbox.drain();
    expect(outbox.enqueued).toEqual([]);
  });
});

const welcome: MailMessage = {
  to: "owner@example.com",
  subject: "Acme Clinic is created",
  html: "<p>Acme Clinic is ready.</p>",
  text: "Acme Clinic is ready.",
};

describe("in memory mailer", () => {
  it("records every message it sends", async () => {
    const mailer = new InMemoryMailer();
    await mailer.send(welcome);
    expect(mailer.sent).toEqual([welcome]);
  });

  it("records nothing for a rejected message", async () => {
    const mailer = new InMemoryMailer();
    await mailer.send({ ...welcome, to: "nobody" });
    expect(mailer.sent).toEqual([]);
  });

  it("empties itself once drained", async () => {
    const mailer = new InMemoryMailer();
    await mailer.send(welcome);
    mailer.drain();
    expect(mailer.sent).toEqual([]);
  });
});

describe("console mailer", () => {
  it("writes the recipient, the subject and the text part to the sink", async () => {
    const lines: string[] = [];
    const mailer = new ConsoleMailer({ sink: (line) => lines.push(line) });
    await mailer.send(welcome);
    expect(lines).toEqual(["mail to owner@example.com | Acme Clinic is created\nAcme Clinic is ready."]);
  });

  it("never writes the html part", async () => {
    const lines: string[] = [];
    const mailer = new ConsoleMailer({ sink: (line) => lines.push(line) });
    await mailer.send(welcome);
    expect(lines.join("\n")).not.toContain("<p>");
  });
});
