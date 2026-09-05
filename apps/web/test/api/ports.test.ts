import { describe, expect, it } from "bun:test";
import {
  ConsoleLogger,
  FixedClock,
  InMemoryHumanVerifier,
  InMemoryIdempotencyStore,
  SilentLogger,
  SlidingWindowRateLimiter,
} from "@base/infrastructure";
import type { HumanVerifier, IdempotencyStore, Logger, RateLimiter } from "@/api";

describe("the api port shapes accept the infrastructure implementations", () => {
  it("accepts every logger", () => {
    const loggers: Logger[] = [new SilentLogger(), new ConsoleLogger()];
    expect(loggers).toHaveLength(2);
  });

  it("accepts the memory human verifier", () => {
    const verifier: HumanVerifier = new InMemoryHumanVerifier([]);
    expect(typeof verifier.verify).toBe("function");
  });

  it("accepts the memory idempotency store", () => {
    const store: IdempotencyStore = new InMemoryIdempotencyStore({ clock: new FixedClock(new Date(0)), timeToLiveMilliseconds: 1 });
    expect(typeof store.find).toBe("function");
  });

  it("accepts the sliding window rate limiter", () => {
    const limiter: RateLimiter = new SlidingWindowRateLimiter({ clock: new FixedClock(new Date(0)) });
    expect(typeof limiter.consume).toBe("function");
  });
});
