import type { DomainEvent } from "./domain-event";

export abstract class AggregateRoot {
  readonly #events: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.#events.push(event);
  }

  pullEvents(): readonly DomainEvent[] {
    const pulled = [...this.#events];
    this.#events.length = 0;
    return pulled;
  }
}
