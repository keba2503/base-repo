import { describe, expect, it } from "bun:test";
import type { JobQueue } from "@base/application";
import type { TenantId } from "@base/domain";
import { tenantIdFactory } from "../factories/tenant";

export type JobQueueHarness = {
  readonly registry: JobQueue;
  scopedTo(tenantId: TenantId): JobQueue;
};

const ownTenant = tenantIdFactory(1);
const otherTenant = tenantIdFactory(2);
const epoch = new Date("2026-01-15T10:00:00.000Z");

function past(millisecondsBefore = 1_000): Date {
  return new Date(epoch.getTime() - millisecondsBefore);
}

function future(millisecondsAfter = 60_000): Date {
  return new Date(epoch.getTime() + millisecondsAfter);
}

export function describeJobQueueContract(name: string, createHarness: () => JobQueueHarness): void {
  describe(`${name} satisfies the JobQueue contract`, () => {
    it("claims a job that is already due", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({ tenantId: ownTenant, name: "reports.generate", payload: { n: 1 } });
      const claimed = await harness.registry.claimDue(10, epoch);
      expect(claimed).toHaveLength(1);
      expect(claimed[0]?.name).toBe("reports.generate");
      expect(claimed[0]?.attempts).toBe(0);
    });

    it("does not claim a job scheduled for later", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({
        tenantId: ownTenant,
        name: "reports.generate",
        payload: {},
        runAt: future(),
      });
      expect(await harness.registry.claimDue(10, epoch)).toEqual([]);
    });

    it("claims a deferred job once its time arrives", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({
        tenantId: ownTenant,
        name: "reports.generate",
        payload: {},
        runAt: future(1_000),
      });
      expect(await harness.registry.claimDue(10, future(2_000))).toHaveLength(1);
    });

    it("respects the claim limit", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({ tenantId: ownTenant, name: "a", payload: {}, runAt: past() });
      await harness.registry.enqueue({ tenantId: ownTenant, name: "b", payload: {}, runAt: past() });
      const claimed = await harness.registry.claimDue(1, epoch);
      expect(claimed).toHaveLength(1);
    });

    it("stops claiming a job once it is marked completed", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({ tenantId: ownTenant, name: "reports.generate", payload: {}, runAt: past() });
      const [job] = await harness.registry.claimDue(10, epoch);
      if (!job) throw new Error("expected a claimed job");
      await harness.registry.markCompleted([job.id]);
      expect(await harness.registry.claimDue(10, epoch)).toEqual([]);
    });

    it("carries the caller's default maximum attempts when none is given", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({ tenantId: ownTenant, name: "reports.generate", payload: {}, runAt: past() });
      const [job] = await harness.registry.claimDue(10, epoch);
      expect(job?.maxAttempts).toBeGreaterThan(0);
    });

    it("honours an explicit maximum attempts", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({
        tenantId: ownTenant,
        name: "reports.generate",
        payload: {},
        runAt: past(),
        maxAttempts: 2,
      });
      const [job] = await harness.registry.claimDue(10, epoch);
      expect(job?.maxAttempts).toBe(2);
    });

    it("reschedules a failed job to its retry time and bumps its attempts", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({ tenantId: ownTenant, name: "reports.generate", payload: {}, runAt: past() });
      const [job] = await harness.registry.claimDue(10, epoch);
      if (!job) throw new Error("expected a claimed job");

      const retryAt = future(2_000);
      await harness.registry.markFailed([{ id: job.id, retryAt }]);

      expect(await harness.registry.claimDue(10, epoch)).toEqual([]);
      const [retried] = await harness.registry.claimDue(10, future(3_000));
      expect(retried?.attempts).toBe(1);
    });

    it("stops claiming a job once it is marked exhausted", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({ tenantId: ownTenant, name: "reports.generate", payload: {}, runAt: past() });
      const [job] = await harness.registry.claimDue(10, epoch);
      if (!job) throw new Error("expected a claimed job");
      await harness.registry.markExhausted([job.id]);
      expect(await harness.registry.claimDue(10, epoch)).toEqual([]);
    });

    it("lets a tenant scoped queue claim its own due job", async () => {
      const harness = createHarness();
      const scoped = harness.scopedTo(ownTenant);
      await scoped.enqueue({ tenantId: ownTenant, name: "reports.generate", payload: {}, runAt: past() });
      expect(await scoped.claimDue(10, epoch)).toHaveLength(1);
    });

    it("hides another tenant's due job from a tenant scoped queue", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({ tenantId: otherTenant, name: "reports.generate", payload: {}, runAt: past() });
      const scoped = harness.scopedTo(ownTenant);
      expect(await scoped.claimDue(10, epoch)).toEqual([]);
    });

    it("lets the registry scope claim jobs across every tenant", async () => {
      const harness = createHarness();
      await harness.registry.enqueue({ tenantId: ownTenant, name: "a", payload: {}, runAt: past() });
      await harness.registry.enqueue({ tenantId: otherTenant, name: "b", payload: {}, runAt: past() });
      expect(await harness.registry.claimDue(10, epoch)).toHaveLength(2);
    });

    it("refuses a tenant scoped queue enqueuing a job for another tenant", async () => {
      const harness = createHarness();
      const scoped = harness.scopedTo(ownTenant);
      const rejected = Promise.resolve().then(() =>
        scoped.enqueue({ tenantId: otherTenant, name: "reports.generate", payload: {} }),
      );
      const caught = await rejected.then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(Error);
    });
  });
}
