import { describe, expect, it } from "bun:test";
import type { Outbox } from "@base/application";
import type { DomainEvent } from "@base/domain";
import { tenantIdFactory } from "../factories/tenant";

export type OutboxHarness = {
  readonly outbox: Outbox;
  enqueued(): Promise<readonly DomainEvent[]>;
};

function eventFactory(sequence: number): DomainEvent {
  return {
    name: "tenant.created",
    tenantId: tenantIdFactory(sequence),
    occurredAt: new Date("2026-01-15T10:00:00.000Z"),
    payload: { sequence },
  };
}

export function describeOutboxContract(name: string, createHarness: () => OutboxHarness): void {
  describe(`${name} satisfies the Outbox contract`, () => {
    it("keeps an enqueued event", async () => {
      const harness = createHarness();
      await harness.outbox.enqueue([eventFactory(1)]);
      expect(await harness.enqueued()).toEqual([eventFactory(1)]);
    });

    it("keeps the order of the events it received", async () => {
      const harness = createHarness();
      await harness.outbox.enqueue([eventFactory(1), eventFactory(2)]);
      await harness.outbox.enqueue([eventFactory(3)]);
      const names = (await harness.enqueued()).map((event) => event.tenantId);
      expect(names).toEqual([tenantIdFactory(1), tenantIdFactory(2), tenantIdFactory(3)]);
    });

    it("accepts an empty batch", async () => {
      const harness = createHarness();
      await harness.outbox.enqueue([]);
      expect(await harness.enqueued()).toEqual([]);
    });

    it("pulls unpublished events up to the limit in order", async () => {
      const harness = createHarness();
      await harness.outbox.enqueue([eventFactory(1), eventFactory(2), eventFactory(3)]);
      const pulled = await harness.outbox.pullUnpublished(2);
      expect(pulled.map((stored) => stored.event.tenantId)).toEqual([tenantIdFactory(1), tenantIdFactory(2)]);
      expect(pulled.every((stored) => stored.attempts === 0)).toBe(true);
    });

    it("stops returning events once they are marked published", async () => {
      const harness = createHarness();
      await harness.outbox.enqueue([eventFactory(1), eventFactory(2)]);
      const [first] = await harness.outbox.pullUnpublished(1);
      if (!first) throw new Error("expected a stored event");
      await harness.outbox.markPublished([first.id]);
      const remaining = await harness.outbox.pullUnpublished(10);
      expect(remaining.map((stored) => stored.event.tenantId)).toEqual([tenantIdFactory(2)]);
    });

    it("counts attempts when an event is marked failed and keeps it pending", async () => {
      const harness = createHarness();
      await harness.outbox.enqueue([eventFactory(1)]);
      const [first] = await harness.outbox.pullUnpublished(1);
      if (!first) throw new Error("expected a stored event");
      await harness.outbox.markFailed([first.id]);
      const [again] = await harness.outbox.pullUnpublished(1);
      expect(again?.attempts).toBe(1);
    });
  });
}
