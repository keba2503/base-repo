import { describe, expect, it } from "bun:test";
import {
  AllowAllPermissions,
  ConsoleLogger,
  InMemoryAnalytics,
  InMemoryAuditStore,
  InMemoryAuditTrail,
  ConsoleMailer,
  DenyAllPermissions,
  FixedClock,
  InMemoryDocumentProcessor,
  InMemoryDocumentRepository,
  InMemoryConsentRepository,
  InMemoryConsentStore,
  InMemoryDocumentStore,
  InMemoryFieldCipher,
  InMemoryFileStore,
  InMemoryHumanVerifier,
  InMemoryIdempotencyStore,
  InMemoryJobQueue,
  InMemoryJobStore,
  InMemoryMailer,
  InMemoryOutbox,
  InMemoryPaymentGateway,
  InMemoryPaymentRepository,
  InMemoryPaymentStore,
  InMemoryPrivacyUserStore,
  InMemoryTelemetry,
  NoopAnalytics,
  NoopTelemetry,
  InMemoryTenantRepository,
  InMemoryTenantStore,
  InMemoryUnitOfWork,
  MemoryUserAnonymizableSource,
  MemoryUserRetainableSource,
  MemoryUserSubjectDataSource,
  NullDocumentProcessor,
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
import { userFieldClassifications } from "@base/domain";
import { startPaymentInstructionFactory } from "./factories/payment";
import { tenantIdFactory } from "./factories/tenant";
import { entityIdFactory, emailFactory } from "./factories/identity";
import {
  describeAnalyticsContract,
  describeAuditTrailContract,
  describeClockContract,
  describeConsentRepositoryContract,
  describeDocumentProcessorContract,
  describeDocumentRepositoryContract,
  describeFieldCipherContract,
  describeFileStoreContract,
  describeHumanVerifierContract,
  describeIdempotencyStoreContract,
  describeIdGeneratorContract,
  describeJobQueueContract,
  describeLoggerContract,
  describeMailerContract,
  describeOutboxContract,
  describePaymentGatewayContract,
  describePaymentRepositoryContract,
  describePermissionsContract,
  describePrivacySourceContract,
  describeRateLimiterContract,
  describeTelemetryContract,
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

describeFieldCipherContract("InMemoryFieldCipher", () => new InMemoryFieldCipher());

describeConsentRepositoryContract("InMemoryConsentRepository", () => ({
  consents: new InMemoryConsentRepository(new InMemoryConsentStore(), tenantIdFactory(1)),
}));

describePrivacySourceContract("InMemoryUserPrivacySources", () => {
  const store = new InMemoryPrivacyUserStore();
  const tenantId = tenantIdFactory(1);
  const subjectId = entityIdFactory(10);
  store.put({
    id: subjectId,
    tenantId,
    email: emailFactory("subject@example.com"),
    displayName: "Test Subject",
    createdAt: new Date("2025-06-01T00:00:00.000Z"),
  });
  return {
    anonymizable: new MemoryUserAnonymizableSource(store),
    subjectData: new MemoryUserSubjectDataSource(store, userFieldClassifications),
    retainable: new MemoryUserRetainableSource(store),
    tenantId,
    subjectId,
    seedSubject: (seedTenant, seedSubject, createdAt) => {
      store.put({
        id: seedSubject,
        tenantId: seedTenant,
        email: emailFactory("seeded@example.com"),
        displayName: "Seeded Subject",
        createdAt,
      });
    },
  };
});

describeAuditTrailContract("InMemoryAuditTrail", () => ({
  audit: new InMemoryAuditTrail(new InMemoryAuditStore(), tenantIdFactory(1)),
}));

describeUnitOfWorkContract("InMemoryUnitOfWork", () => new InMemoryUnitOfWork());

describeOutboxContract("InMemoryOutbox", () => {
  const outbox = new InMemoryOutbox();
  return { outbox, enqueued: () => Promise.resolve(outbox.enqueued) };
});

describeTelemetryContract("InMemoryTelemetry", () => new InMemoryTelemetry());
describeTelemetryContract("NoopTelemetry", () => new NoopTelemetry());

describeAnalyticsContract("InMemoryAnalytics", () => new InMemoryAnalytics());
describeAnalyticsContract("NoopAnalytics", () => new NoopAnalytics());

describeLoggerContract("SilentLogger", () => new SilentLogger());
describeLoggerContract("ConsoleLogger", () => new ConsoleLogger({ sink: recordingSink().sink }));

describeMailerContract("InMemoryMailer", () => ({ mailer: new InMemoryMailer(), recipient: "owner@example.com" }));
describeMailerContract("ConsoleMailer", () => ({
  mailer: new ConsoleMailer({ sink: () => undefined }),
  recipient: "owner@example.com",
}));

describeJobQueueContract("InMemoryJobQueue", () => {
  const store = new InMemoryJobStore();
  return {
    registry: new InMemoryJobQueue(store, { kind: "registry" }),
    scopedTo: (tenantId) => new InMemoryJobQueue(store, { kind: "tenant", tenantId }),
  };
});

describeTenantRepositoryContract("InMemoryTenantRepository", () => {
  const store = new InMemoryTenantStore();
  return {
    registry: new InMemoryTenantRepository(store, { kind: "registry" }),
    scopedTo: (tenantId) => new InMemoryTenantRepository(store, { kind: "tenant", tenantId }),
  };
});

describeDocumentRepositoryContract("InMemoryDocumentRepository", () => {
  const store = new InMemoryDocumentStore();
  return {
    registry: new InMemoryDocumentRepository(store, { kind: "registry" }),
    scopedTo: (tenantId) => new InMemoryDocumentRepository(store, { kind: "tenant", tenantId }),
  };
});

describePaymentRepositoryContract("InMemoryPaymentRepository", () => {
  const store = new InMemoryPaymentStore();
  return {
    registry: new InMemoryPaymentRepository(store, { kind: "registry" }),
    scopedTo: (tenantId) => new InMemoryPaymentRepository(store, { kind: "tenant", tenantId }),
  };
});

const paymentGatewayWebhookSecret = "test-payment-webhook-secret-0123456789";
const paymentGatewayBaseUrl = "https://payments.example";

describePaymentGatewayContract("InMemoryPaymentGateway", () => {
  const gateway = new InMemoryPaymentGateway({
    clock: new SystemClock(),
    webhookSecret: paymentGatewayWebhookSecret,
    baseUrl: paymentGatewayBaseUrl,
  });
  const instruction = startPaymentInstructionFactory();
  return {
    gateway,
    instruction,
    notificationOf: (kind, fixture) => gateway.buildNotification(kind, fixture),
    tamperedNotification: (fixture) => gateway.buildTamperedNotification("succeeded", fixture),
    staleNotification: (fixture) => gateway.buildStaleNotification("succeeded", fixture),
    unsupportedNotification: (fixture) => gateway.buildUnsupportedNotification(fixture),
    malformedNotification: () => gateway.buildMalformedNotification(),
  };
});

describeFileStoreContract("InMemoryFileStore", () => ({ store: new InMemoryFileStore() }));

describeDocumentProcessorContract("InMemoryDocumentProcessor", () => ({ processor: new InMemoryDocumentProcessor() }));
describeDocumentProcessorContract("NullDocumentProcessor", () => ({ processor: new NullDocumentProcessor() }));

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

describe("in memory telemetry", () => {
  it("records a span with its attributes", () => {
    const telemetry = new InMemoryTelemetry();
    const span = telemetry.startSpan("http.request", { requestId: "req-1", tenantId: "tenant-1" });
    span.setAttribute("statusCode", 200);
    span.end("ok");
    expect(telemetry.spans).toEqual([
      {
        name: "http.request",
        attributes: { requestId: "req-1", tenantId: "tenant-1", statusCode: 200 },
        exceptions: [],
        status: "ok",
        ended: true,
      },
    ]);
  });

  it("redacts an attribute classified as personal before recording the span", () => {
    const telemetry = new InMemoryTelemetry({ policy: { subjectId: "personal" } });
    const span = telemetry.startSpan("http.request", { subjectId: "user-1", tenantId: "tenant-1" });
    span.end();
    expect(telemetry.spans[0]?.attributes).toEqual({ subjectId: redactedMarker, tenantId: "tenant-1" });
  });

  it("marks the span as failed once an exception is recorded", () => {
    const telemetry = new InMemoryTelemetry();
    const span = telemetry.startSpan("job.execute");
    span.recordException(new Error("boom"));
    span.end();
    const recorded = telemetry.spans[0];
    expect(recorded?.status).toBe("error");
    expect(recorded?.exceptions).toHaveLength(1);
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
