import type { Outbox } from "@base/application";
import type { DomainEvent } from "@base/domain";

export class InMemoryOutbox implements Outbox {
  readonly #events: DomainEvent[] = [];

  enqueue(events: readonly DomainEvent[]): Promise<void> {
    this.#events.push(...events);
    return Promise.resolve();
  }

  get enqueued(): readonly DomainEvent[] {
    return [...this.#events];
  }

  drain(): readonly DomainEvent[] {
    const drained = [...this.#events];
    this.#events.length = 0;
    return drained;
  }
}
