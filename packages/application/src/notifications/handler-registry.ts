import type { EventHandler } from "./event-handler";

export type HandlerRegistry = {
  readonly eventNames: readonly string[];
  handlersFor(eventName: string): readonly EventHandler[];
};

export function handlerRegistry(handlers: readonly EventHandler[]): HandlerRegistry {
  const byEventName = new Map<string, readonly EventHandler[]>();
  for (const handler of handlers) {
    const registered = byEventName.get(handler.eventName) ?? [];
    byEventName.set(handler.eventName, [...registered, handler]);
  }

  return {
    eventNames: [...byEventName.keys()],
    handlersFor: (eventName) => byEventName.get(eventName) ?? [],
  };
}
