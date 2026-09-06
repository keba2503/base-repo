import { describe, expect, it } from "bun:test";
import { RandomIdGenerator } from "@base/infrastructure";
import { defaultModuleActivation, type ModuleActivation } from "../../../../architecture/modules";
import { createContainer } from "../../src/main/container";
import { env } from "../../src/main/env";
import { dispatchJobsOperation, dispatchOutboxOperation } from "../../src/main/use-cases";
import { workerActor } from "../../src/main/actor";

function activationWith(overrides: Partial<ModuleActivation>): ModuleActivation {
  return { ...defaultModuleActivation, ...overrides };
}

function fixtureTenantCreatedEvent(): never {
  const idGenerator = new RandomIdGenerator();
  const tenantId = idGenerator.next();
  return {
    name: "tenant.created",
    tenantId,
    occurredAt: new Date(),
    payload: { tenantId, slug: "modularity-test-fixture" },
  } as unknown as never;
}

async function enqueueTenantCreatedEvent(container: ReturnType<typeof createContainer>): Promise<void> {
  await container.unitOfWork.run({ kind: "registry" }, async () => {
    await container.outbox.enqueue([fixtureTenantCreatedEvent()]);
  });
}

describe("worker composition root with the notifications module inactive", () => {
  it("degrades a tenant.created event to unhandled instead of throwing", async () => {
    const container = createContainer(env);
    await enqueueTenantCreatedEvent(container);
    const modules = activationWith({ notifications: false });
    const dispatch = dispatchOutboxOperation(container, env, modules);
    const outcome = await dispatch(10, 5);
    expect(outcome.refused).toBe(false);
    if (outcome.refused) return;
    expect(outcome.counts.pulled).toBeGreaterThanOrEqual(1);
    expect(outcome.counts.unhandled).toBeGreaterThanOrEqual(1);
    expect(outcome.counts.published).toBe(0);
    expect(outcome.counts.failed).toBe(0);
    await container.close();
  });

  it("does not pull the same event again once marked unhandled", async () => {
    const container = createContainer(env);
    await enqueueTenantCreatedEvent(container);
    const modules = activationWith({ notifications: false });
    const dispatch = dispatchOutboxOperation(container, env, modules);
    await dispatch(10, 5);
    const secondOutcome = await dispatch(10, 5);
    expect(secondOutcome.refused).toBe(false);
    if (secondOutcome.refused) return;
    expect(secondOutcome.counts.pulled).toBe(0);
    await container.close();
  });
});

describe("worker composition root with the documents and privacy modules inactive", () => {
  it("dispatches jobs with no executor registered and does not throw", async () => {
    const container = createContainer(env);
    const modules = activationWith({ documents: false, privacy: false });
    const dispatch = dispatchJobsOperation(container, modules);
    const outcome = await dispatch(10);
    expect(outcome.refused).toBe(false);
    await container.close();
  });
});

describe("worker composition root with every optional module active", () => {
  it("registers a handler for the outbox event instead of leaving it unhandled", async () => {
    const container = createContainer(env);
    const dispatchOutbox = dispatchOutboxOperation(container, env);
    await enqueueTenantCreatedEvent(container);
    const outboxOutcome = await dispatchOutbox(10, 5);
    expect(outboxOutcome.refused).toBe(false);
    if (!outboxOutcome.refused) {
      expect(outboxOutcome.counts.unhandled).toBe(0);
    }
    await container.close();
  });

  it("dispatches jobs without throwing", async () => {
    const container = createContainer(env);
    const dispatchJobs = dispatchJobsOperation(container);
    const jobsOutcome = await dispatchJobs(10);
    expect(jobsOutcome.refused).toBe(false);
    expect(workerActor().kind).toBeDefined();
    await container.close();
  });
});
