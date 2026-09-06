import { describe, expect, it } from "bun:test";
import {
  AllowAllPermissions,
  ConsoleLogger,
  ConsoleMailer,
  DenyAllPermissions,
  FixedClock,
  InMemoryHumanVerifier,
  InMemoryIdempotencyStore,
  InMemoryMailer,
  InMemoryOutbox,
  InMemoryTenantRepository,
  InMemoryTenantStore,
  InMemoryUnitOfWork,
  RandomIdGenerator,
  redact,
  redactedMarker,
  redactionPolicyFrom,
  ScopedPermissions,
  SequentialIdGenerator,
  SilentLogger,
  SlidingWindowRateLimiter,
  SystemClock,
  type LogSink,
} from "@base/infrastructure";
import type { LogFields, MailMessage } from "@base/application";
import {
  describeClockContract,
  describeHumanVerifierContract,
  describeIdempotencyStoreContract,
  describeIdGeneratorContract,
  describeLoggerContract,
  describeMailerContract,
  describeOutboxContract,
  describePermissionsContract,
  describeRateLimiterContract,
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

describeHumanVerifierContract("InMemoryHumanVerifier", () => ({
  verifier: new InMemoryHumanVerifier(["known-token"]),
  recognisedToken: "known-token",
  unrecognisedToken: "unknown-token",
}));

const idempotencyTimeToLive = 24 * 60 * 60 * 1000;

describeIdempotencyStoreContract("InMemoryIdempotencyStore", () => {
  const clock = new FixedClock(new Date("2026-01-15T10:00:00.000Z"));
  return {
    store: new InMemoryIdempotencyStore({ clock, timeToLiveMilliseconds: idempotencyTimeToLive }),
    timeToLiveMilliseconds: idempotencyTimeToLive,
    advanceBy: (milliseconds) => {
      clock.advanceBy(milliseconds);
    },
  };
});

describeRateLimiterContract("SlidingWindowRateLimiter", () => {
  const clock = new FixedClock(new Date("2026-01-15T10:00:00.000Z"));
  return {
    limiter: new SlidingWindowRateLimiter({ clock }),
    advanceBy: (milliseconds) => {
      clock.advanceBy(milliseconds);
    },
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

  it("hides a classified field nested inside a plain object", () => {
    expect(
      redact({ email: "personal" }, { user: { email: "karen@example.com", id: "1" } }),
    ).toEqual({ user: { email: redactedMarker, id: "1" } });
  });

  it("hides a classified field nested inside an array of plain objects", () => {
    expect(
      redact({ email: "personal" }, { users: [{ email: "a@example.com" }, { email: "b@example.com" }] }),
    ).toEqual({ users: [{ email: redactedMarker }, { email: redactedMarker }] });
  });

  it("leaves a date value untouched instead of expanding it", () => {
    const createdAt = new Date("2026-01-15T10:00:00.000Z");
    expect(redact({}, { createdAt })).toEqual({ createdAt });
  });
});

describe("redactionPolicyFrom", () => {
  it("merges classifications declared by different entities", () => {
    expect(
      redactionPolicyFrom({ email: "personal" }, { keyHash: "sensitive" }),
    ).toEqual({ email: "personal", keyHash: "sensitive" });
  });

  it("keeps the most restrictive classification when entities disagree on a field name", () => {
    expect(
      redactionPolicyFrom({ name: "none" }, { name: "personal" }),
    ).toEqual({ name: "personal" });
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
