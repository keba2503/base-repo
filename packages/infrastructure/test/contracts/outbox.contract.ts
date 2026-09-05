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
  });
}
