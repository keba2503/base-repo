import type { DomainEvent } from "@base/domain";

export type StoredEvent = {
  readonly id: string;
  readonly event: DomainEvent;
  readonly attempts: number;
};

export type Outbox = {
  enqueue(events: readonly DomainEvent[]): Promise<void>;
  pullUnpublished(limit: number): Promise<readonly StoredEvent[]>;
  markPublished(ids: readonly string[]): Promise<void>;
  markFailed(ids: readonly string[]): Promise<void>;
};
