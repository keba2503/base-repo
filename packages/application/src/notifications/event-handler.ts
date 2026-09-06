import type { DomainError, DomainEvent, Result } from "@base/domain";

export type EventHandler = {
  readonly eventName: string;
  handle(event: DomainEvent): Promise<Result<void, DomainError>>;
};
