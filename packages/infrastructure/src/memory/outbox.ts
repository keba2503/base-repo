import type { Outbox, StoredEvent } from "@base/application";
import type { DomainEvent } from "@base/domain";

type Row = { id: string; event: DomainEvent; attempts: number; publishedAt: Date | null };

export class InMemoryOutbox implements Outbox {
  readonly #rows: Row[] = [];
  #sequence = 0;

  enqueue(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      this.#sequence += 1;
      this.#rows.push({ id: String(this.#sequence), event, attempts: 0, publishedAt: null });
    }
    return Promise.resolve();
  }

  pullUnpublished(limit: number): Promise<readonly StoredEvent[]> {
    const pending = this.#rows
      .filter((row) => row.publishedAt === null)
      .slice(0, limit)
      .map(({ id, event, attempts }) => ({ id, event, attempts }));
    return Promise.resolve(pending);
  }

  markPublished(ids: readonly string[]): Promise<void> {
    for (const row of this.#rows) {
      if (ids.includes(row.id)) row.publishedAt = new Date(0);
    }
    return Promise.resolve();
  }

  markFailed(ids: readonly string[]): Promise<void> {
    for (const row of this.#rows) {
      if (ids.includes(row.id)) row.attempts += 1;
    }
    return Promise.resolve();
  }

  get enqueued(): readonly DomainEvent[] {
    return this.#rows.map((row) => row.event);
  }

  drain(): readonly DomainEvent[] {
    const drained = this.#rows.map((row) => row.event);
    this.#rows.length = 0;
    return drained;
  }
}
