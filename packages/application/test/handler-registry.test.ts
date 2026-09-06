import { describe, expect, it } from "bun:test";
import { ok } from "@base/domain";
import { handlerRegistry, type EventHandler } from "../src/index";

function handlerFactory(eventName: string): EventHandler {
  return { eventName, handle: () => Promise.resolve(ok(undefined)) };
}

describe("handler registry", () => {
  it("finds the handler registered for an event name", () => {
    const created = handlerFactory("tenant.created");
    expect(handlerRegistry([created]).handlersFor("tenant.created")).toEqual([created]);
  });

  it("returns nothing for an unknown event name", () => {
    expect(handlerRegistry([handlerFactory("tenant.created")]).handlersFor("tenant.archived")).toEqual([]);
  });

  it("keeps every handler registered for the same event in order", () => {
    const first = handlerFactory("tenant.created");
    const second = handlerFactory("tenant.created");
    expect(handlerRegistry([first, second]).handlersFor("tenant.created")).toEqual([first, second]);
  });

  it("lists the event names it knows", () => {
    const registry = handlerRegistry([handlerFactory("tenant.created"), handlerFactory("tenant.archived")]);
    expect(registry.eventNames).toEqual(["tenant.created", "tenant.archived"]);
  });

  it("does not change when the source list changes afterwards", () => {
    const handlers = [handlerFactory("tenant.created")];
    const registry = handlerRegistry(handlers);
    handlers.push(handlerFactory("tenant.archived"));
    expect(registry.eventNames).toEqual(["tenant.created"]);
  });
});
