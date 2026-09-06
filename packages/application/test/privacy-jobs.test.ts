import { describe, expect, it } from "bun:test";
import { classify, entityIdOf, isOk } from "@base/domain";
import {
  eraseSubjectDataExecutor,
  exportSubjectDataExecutor,
  retentionSweepExecutor,
  type StoredJob,
  type SubjectDataRow,
} from "../src/index";
import { StubClock, StubJobQueue, StubLogger } from "./doubles/ports";
import { StubAnonymizableSource, StubRetainableSource, StubSubjectDataSource } from "./doubles/privacy-ports";
import { StubFileStore } from "./doubles/documents-ports";
import { tenantIdFactory } from "./factories/actor";

const tenantId = tenantIdFactory(1);
const subjectId = entityIdOf(tenantIdFactory(700));

function jobFor(name: string, payload: unknown): StoredJob {
  return { id: "1", tenantId, name, payload, attempts: 0, maxAttempts: 5, priority: "background" };
}

describe("composing a subject data export from classified sources", () => {
  it("keeps only fields classified as personal or sensitive", async () => {
    const classifications = classify<SubjectDataRow>({
      id: "none",
      email: "personal",
      internalNotes: "sensitive",
    });
    const source = new StubSubjectDataSource("users", classifications);
    source.seed(subjectId, [{ id: "u1", email: "karen@example.com", internalNotes: "secret" }]);
    const exportStore = new StubFileStore();
    const executor = exportSubjectDataExecutor({
      sources: [source],
      exportStore,
      clock: new StubClock(new Date("2026-01-15T10:00:00.000Z")),
      logger: new StubLogger(),
    });

    const result = await executor.execute(jobFor("privacy.export.subject", { subjectId }));
    expect(isOk(result)).toBe(true);
    const saved = exportStore.saved[0];
    expect(saved?.contentType).toBe("application/json");
    const parsed: unknown = JSON.parse(new TextDecoder().decode(saved?.bytes));
    expect(parsed).toEqual({ users: [{ email: "karen@example.com", internalNotes: "secret" }] });
  });
});

describe("erasing a subject across every registered source", () => {
  it("anonymizes the subject in every source with the same token", async () => {
    const users = new StubAnonymizableSource("users");
    const documents = new StubAnonymizableSource("documents");
    const executor = eraseSubjectDataExecutor({
      sources: [users, documents],
      clock: new StubClock(new Date("2026-01-15T10:00:00.000Z")),
    });

    await executor.execute(jobFor("privacy.erasure.subject", { subjectId }));

    expect(users.calls).toHaveLength(1);
    expect(documents.calls).toHaveLength(1);
    expect(users.calls[0]?.token).toBe(documents.calls[0]?.token);
    expect(users.calls[0]?.subjectId).toBe(subjectId);
  });
});

describe("sweeping expired records for retention", () => {
  it("anonymizes every subject older than the configured retention and reschedules itself", async () => {
    const users = new StubRetainableSource("users");
    users.seedExpired([subjectId]);
    const jobs = new StubJobQueue();
    const executor = retentionSweepExecutor({
      sources: [users],
      policy: { users: 365 },
      clock: new StubClock(new Date("2026-01-15T10:00:00.000Z")),
      jobs,
      sweepIntervalDays: 1,
    });

    await executor.execute(jobFor("privacy.retention.sweep", {}));

    expect(users.calls).toHaveLength(1);
    const rescheduled = await jobs.claimDue(10, new Date(8640000000000000));
    expect(rescheduled.map((job) => job.name)).toEqual(["privacy.retention.sweep"]);
  });

  it("skips a source that has no retention configured", async () => {
    const users = new StubRetainableSource("users");
    users.seedExpired([subjectId]);
    const jobs = new StubJobQueue();
    const executor = retentionSweepExecutor({
      sources: [users],
      policy: {},
      clock: new StubClock(new Date("2026-01-15T10:00:00.000Z")),
      jobs,
      sweepIntervalDays: 1,
    });

    await executor.execute(jobFor("privacy.retention.sweep", {}));

    expect(users.calls).toHaveLength(0);
  });
});
