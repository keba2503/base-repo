import { beforeEach, describe, expect, it } from "bun:test";
import { err, isErr, isOk, ok, unavailable, type DomainError, type Result } from "@base/domain";
import {
  dispatchJobs,
  executorRegistry,
  type DispatchJobs,
  type DispatchJobsResponse,
  type JobExecutor,
  type StoredJob,
} from "../src/index";
import { actorFactory } from "./factories/actor";
import { storedJobFactory } from "./factories/job";
import { StubClock, StubJobQueue, StubLogger, StubPermissions } from "./doubles/ports";

type Harness = {
  useCase: DispatchJobs;
  jobs: StubJobQueue;
  logger: StubLogger;
  clock: StubClock;
  executed: StoredJob[];
};

type ExecutorBehaviour = "succeeds" | "fails" | "throws";

function executorFactory(jobName: string, behaviour: ExecutorBehaviour, executed: StoredJob[]): JobExecutor {
  return {
    jobName,
    execute(job) {
      executed.push(job);
      if (behaviour === "throws") throw new Error("executor exploded");
      if (behaviour === "fails") return Promise.resolve(err(unavailable("jobs.provider.unavailable", "down")));
      return Promise.resolve(ok(undefined));
    },
  };
}

function harnessFactory(executors: readonly JobExecutor[], granted: readonly string[] = ["jobQueue:dispatch"]): Harness {
  const jobs = new StubJobQueue();
  const logger = new StubLogger();
  const clock = new StubClock(new Date("2026-01-15T10:00:00.000Z"));
  const useCase = dispatchJobs({
    jobs,
    executors: executorRegistry(executors),
    permissions: new StubPermissions(granted),
    logger,
    clock,
  });
  return { useCase, jobs, logger, clock, executed: [] };
}

function expectOk(result: Result<DispatchJobsResponse, DomainError>): DispatchJobsResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

const request = { actor: actorFactory(), limit: 10 };

let executed: StoredJob[];

beforeEach(() => {
  executed = [];
});

describe("dispatching completed jobs", () => {
  it("marks a job completed when its executor succeeds", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "succeeds", executed)]);
    const id = harness.jobs.seed(storedJobFactory());
    await harness.useCase(request);
    expect(harness.jobs.completed).toEqual([id]);
  });

  it("hands the claimed job to its executor", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "succeeds", executed)]);
    harness.jobs.seed(storedJobFactory());
    await harness.useCase(request);
    expect(executed).toEqual([storedJobFactory()]);
  });

  it("counts the completed jobs", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "succeeds", executed)]);
    harness.jobs.seed(storedJobFactory({ id: "1" }));
    harness.jobs.seed(storedJobFactory({ id: "2" }));
    const response = expectOk(await harness.useCase(request));
    expect(response).toEqual({ claimed: 2, completed: 2, failed: 0, unhandled: 0, exhausted: 0 });
  });

  it("does not claim a job scheduled in the future", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "succeeds", executed)]);
    harness.jobs.seed(storedJobFactory(), harness.clock.now().getTime() + 60_000);
    const response = expectOk(await harness.useCase(request));
    expect(response.claimed).toBe(0);
  });

  it("claims a job whose scheduled time has arrived", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "succeeds", executed)]);
    harness.jobs.seed(storedJobFactory(), harness.clock.now().getTime());
    const response = expectOk(await harness.useCase(request));
    expect(response.claimed).toBe(1);
  });

  it("claims no more jobs than the limit", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "succeeds", executed)]);
    harness.jobs.seed(storedJobFactory({ id: "1" }));
    harness.jobs.seed(storedJobFactory({ id: "2" }));
    const response = expectOk(await harness.useCase({ ...request, limit: 1 }));
    expect(response.claimed).toBe(1);
  });
});

describe("dispatching failing jobs", () => {
  it("keeps a job pending with a growing delay when its executor fails", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "fails", executed)]);
    const id = harness.jobs.seed(storedJobFactory({ attempts: 0, maxAttempts: 5 }));
    await harness.useCase(request);
    expect(harness.jobs.failed).toEqual([id]);
    expect(harness.jobs.completed).toEqual([]);
  });

  it("marks a job failed when its executor throws", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "throws", executed)]);
    const id = harness.jobs.seed(storedJobFactory({ attempts: 0, maxAttempts: 5 }));
    await harness.useCase(request);
    expect(harness.jobs.failed).toEqual([id]);
  });

  it("logs the failure with the job identity and the error code", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "fails", executed)]);
    const id = harness.jobs.seed(storedJobFactory({ attempts: 0, maxAttempts: 5 }));
    await harness.useCase(request);
    expect(harness.logger.lines).toEqual([
      {
        level: "error",
        message: "job failed",
        fields: {
          jobId: id,
          jobName: "reports.generate",
          attempts: 0,
          code: "jobs.provider.unavailable",
          reason: "down",
        },
      },
    ]);
  });

  it("counts the failed jobs", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "fails", executed)]);
    harness.jobs.seed(storedJobFactory({ attempts: 0, maxAttempts: 5 }));
    const response = expectOk(await harness.useCase(request));
    expect(response).toEqual({ claimed: 1, completed: 0, failed: 1, unhandled: 0, exhausted: 0 });
  });
});

describe("dispatching exhausted jobs", () => {
  it("marks a job exhausted once it reaches its own maximum attempts", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "fails", executed)]);
    const id = harness.jobs.seed(storedJobFactory({ attempts: 4, maxAttempts: 5 }));
    await harness.useCase(request);
    expect(harness.jobs.exhausted).toEqual([id]);
    expect(harness.jobs.failed).toEqual([]);
  });

  it("logs the exhaustion as an error", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "fails", executed)]);
    harness.jobs.seed(storedJobFactory({ attempts: 4, maxAttempts: 5 }));
    await harness.useCase(request);
    expect(harness.logger.messagesAt("error")).toEqual(["job exhausted its attempts"]);
  });

  it("counts the exhausted jobs", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "fails", executed)]);
    harness.jobs.seed(storedJobFactory({ attempts: 4, maxAttempts: 5 }));
    const response = expectOk(await harness.useCase(request));
    expect(response.exhausted).toBe(1);
  });
});

describe("dispatching unknown jobs", () => {
  it("marks a job without an executor as exhausted", async () => {
    const harness = harnessFactory([]);
    const id = harness.jobs.seed(storedJobFactory({ name: "reports.unknown" }));
    await harness.useCase(request);
    expect(harness.jobs.exhausted).toEqual([id]);
  });

  it("warns about the missing executor", async () => {
    const harness = harnessFactory([]);
    harness.jobs.seed(storedJobFactory({ name: "reports.unknown" }));
    await harness.useCase(request);
    expect(harness.logger.messagesAt("warn")).toEqual(["job has no executor"]);
  });

  it("counts the unhandled jobs", async () => {
    const harness = harnessFactory([]);
    harness.jobs.seed(storedJobFactory({ name: "reports.unknown" }));
    const response = expectOk(await harness.useCase(request));
    expect(response.unhandled).toBe(1);
  });
});

describe("refusing to dispatch", () => {
  it("refuses an actor without the dispatch permission", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "succeeds", executed)], []);
    const result = await harness.useCase(request);
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.kind).toBe("forbidden");
  });

  it("touches nothing when the actor is not allowed", async () => {
    const harness = harnessFactory([executorFactory("reports.generate", "succeeds", executed)], []);
    harness.jobs.seed(storedJobFactory());
    await harness.useCase(request);
    expect(harness.jobs.completed).toEqual([]);
  });
});
