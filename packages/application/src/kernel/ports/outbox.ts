import type { DomainEvent } from "@base/domain";

export type Outbox = {
  enqueue(events: readonly DomainEvent[]): Promise<void>;
};
