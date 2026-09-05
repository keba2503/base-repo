import { beforeEach, describe, expect, it } from "bun:test";
import { err, isErr, isOk, ok, unavailable, type DomainError, type DomainEvent, type Result } from "@base/domain";
import {
  dispatchOutbox,
  handlerRegistry,
  type DispatchOutbox,
  type DispatchOutboxResponse,
  type EventHandler,
} from "../src/index";
import { actorFactory } from "./factories/actor";
import { eventFactory } from "./factories/event";
import { StubLogger, StubOutbox, StubPermissions } from "./doubles/ports";

type Harness = {
  useCase: DispatchOutbox;
  outbox: StubOutbox;
  logger: StubLogger;
  handled: DomainEvent[];
};

type HandlerBehaviour = "succeeds" | "fails" | "throws";

function handlerFactory(eventName: string, behaviour: HandlerBehaviour, handled: DomainEvent[]): EventHandler {
  return {
    eventName,
    handle(event) {
      handled.push(event);
      if (behaviour === "throws") throw new Error("handler exploded");
      if (behaviour === "fails") return Promise.resolve(err(unavailable("mail.provider.unavailable", "down")));
      return Promise.resolve(ok(undefined));
    },
  };
}

function harnessFactory(
  handlers: readonly EventHandler[],
  granted: readonly string[] = ["outbox:dispatch"],
): Harness {
  const outbox = new StubOutbox();
  const logger = new StubLogger();
  const useCase = dispatchOutbox({
    outbox,
    handlers: handlerRegistry(handlers),
    permissions: new StubPermissions(granted),
    logger,
  });
  return { useCase, outbox, logger, handled: [] };
}

function expectOk(result: Result<DispatchOutboxResponse, DomainError>): DispatchOutboxResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

const request = { actor: actorFactory(), limit: 10, maxAttempts: 5 };

let handled: DomainEvent[];

beforeEach(() => {
  handled = [];
});

describe("dispatching handled events", () => {
  it("marks an event published when its handler succeeds", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)]);
    const id = harness.outbox.seed(eventFactory());
    await harness.useCase(request);
    expect(harness.outbox.published).toEqual([id]);
  });

  it("hands the stored event to the handler", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)]);
    harness.outbox.seed(eventFactory());
    await harness.useCase(request);
    expect(handled).toEqual([eventFactory()]);
  });

  it("counts the published events", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)]);
    harness.outbox.seed(eventFactory());
    harness.outbox.seed(eventFactory());
    const response = expectOk(await harness.useCase(request));
    expect(response).toEqual({ pulled: 2, published: 2, failed: 0, unhandled: 0, abandoned: 0 });
  });

  it("runs every handler registered for the event", async () => {
    const harness = harnessFactory([
      handlerFactory("tenant.created", "succeeds", handled),
      handlerFactory("tenant.created", "succeeds", handled),
    ]);
    harness.outbox.seed(eventFactory());
    await harness.useCase(request);
    expect(handled).toHaveLength(2);
  });

  it("pulls no more events than the limit", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)]);
    harness.outbox.seed(eventFactory());
    harness.outbox.seed(eventFactory());
    harness.outbox.seed(eventFactory());
    const response = expectOk(await harness.useCase({ ...request, limit: 2 }));
    expect(response.pulled).toBe(2);
  });

  it("reports zero counts when nothing is pending", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)]);
    const response = expectOk(await harness.useCase(request));
    expect(response).toEqual({ pulled: 0, published: 0, failed: 0, unhandled: 0, abandoned: 0 });
  });
});

describe("dispatching failing events", () => {
  it("marks an event failed when its handler returns a failure", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "fails", handled)]);
    const id = harness.outbox.seed(eventFactory());
    await harness.useCase(request);
    expect(harness.outbox.failed).toEqual([id]);
  });

  it("marks an event failed when its handler throws", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "throws", handled)]);
    const id = harness.outbox.seed(eventFactory());
    await harness.useCase(request);
    expect(harness.outbox.failed).toEqual([id]);
  });

  it("continues with the remaining events after a failure", async () => {
    const harness = harnessFactory([
      handlerFactory("tenant.created", "fails", handled),
      handlerFactory("tenant.renamed", "succeeds", handled),
    ]);
    harness.outbox.seed(eventFactory());
    const later = harness.outbox.seed(eventFactory({ name: "tenant.renamed" }));
    await harness.useCase(request);
    expect(harness.outbox.published).toEqual([later]);
  });

  it("counts the failed events", async () => {
    const harness = harnessFactory([
      handlerFactory("tenant.created", "fails", handled),
      handlerFactory("tenant.renamed", "succeeds", handled),
    ]);
    harness.outbox.seed(eventFactory());
    harness.outbox.seed(eventFactory({ name: "tenant.renamed" }));
    const response = expectOk(await harness.useCase(request));
    expect(response).toEqual({ pulled: 2, published: 1, failed: 1, unhandled: 0, abandoned: 0 });
  });

  it("logs the failure with the event identity and the error code", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "fails", handled)]);
    const id = harness.outbox.seed(eventFactory());
    await harness.useCase(request);
    expect(harness.logger.lines).toEqual([
      {
        level: "error",
        message: "outbox event failed",
        fields: { eventId: id, eventName: "tenant.created", attempts: 0, code: "mail.provider.unavailable", reason: "down" },
      },
    ]);
  });

  it("stops at the first failing handler of an event", async () => {
    const harness = harnessFactory([
      handlerFactory("tenant.created", "fails", handled),
      handlerFactory("tenant.created", "succeeds", handled),
    ]);
    harness.outbox.seed(eventFactory());
    await harness.useCase(request);
    expect(handled).toHaveLength(1);
  });
});

describe("dispatching unknown events", () => {
  it("marks an event without handler as published", async () => {
    const harness = harnessFactory([]);
    const id = harness.outbox.seed(eventFactory({ name: "tenant.archived" }));
    await harness.useCase(request);
    expect(harness.outbox.published).toEqual([id]);
  });

  it("warns about the missing handler", async () => {
    const harness = harnessFactory([]);
    harness.outbox.seed(eventFactory({ name: "tenant.archived" }));
    await harness.useCase(request);
    expect(harness.logger.messagesAt("warn")).toEqual(["outbox event has no handler"]);
  });

  it("counts the unhandled events", async () => {
    const harness = harnessFactory([]);
    harness.outbox.seed(eventFactory({ name: "tenant.archived" }));
    const response = expectOk(await harness.useCase(request));
    expect(response.unhandled).toBe(1);
  });
});

describe("dispatching exhausted events", () => {
  it("abandons an event that reached the maximum attempts", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)]);
    const id = harness.outbox.seed(eventFactory(), 5);
    await harness.useCase(request);
    expect(harness.outbox.published).toEqual([id]);
  });

  it("does not run the handler of an abandoned event", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)]);
    harness.outbox.seed(eventFactory(), 5);
    await harness.useCase(request);
    expect(handled).toEqual([]);
  });

  it("logs the abandonment as an error", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)]);
    harness.outbox.seed(eventFactory(), 5);
    await harness.useCase(request);
    expect(harness.logger.messagesAt("error")).toEqual(["outbox event abandoned after too many attempts"]);
  });

  it("counts the abandoned events", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)]);
    harness.outbox.seed(eventFactory(), 5);
    const response = expectOk(await harness.useCase(request));
    expect(response.abandoned).toBe(1);
  });

  it("still retries an event below the maximum attempts", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)]);
    harness.outbox.seed(eventFactory(), 4);
    await harness.useCase(request);
    expect(handled).toHaveLength(1);
  });
});

describe("refusing to dispatch", () => {
  it("refuses an actor without the dispatch permission", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)], []);
    const result = await harness.useCase(request);
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.kind).toBe("forbidden");
  });

  it("touches nothing when the actor is not allowed", async () => {
    const harness = harnessFactory([handlerFactory("tenant.created", "succeeds", handled)], []);
    harness.outbox.seed(eventFactory());
    await harness.useCase(request);
    expect(harness.outbox.published).toEqual([]);
  });
});
