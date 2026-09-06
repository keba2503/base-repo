import { describe, expect, it } from "bun:test";
import type { RateLimiter, RateLimitRequest } from "@base/application";

export type RateLimiterHarness = {
  readonly limiter: RateLimiter;
  advanceBy(milliseconds: number): void;
};

const request: RateLimitRequest = {
  bucket: "tenants-write",
  subject: "actor:1",
  limit: 3,
  windowMilliseconds: 60_000,
};

async function consumeTimes(limiter: RateLimiter, times: number, overrides: Partial<RateLimitRequest> = {}) {
  const decisions = [];
  for (let index = 0; index < times; index += 1) {
    decisions.push(await limiter.consume({ ...request, ...overrides }));
  }
  return decisions;
}

export function describeRateLimiterContract(
  name: string,
  createHarness: () => RateLimiterHarness,
): void {
  describe(`${name} satisfies the RateLimiter contract`, () => {
    it("allows requests up to the limit", async () => {
      const harness = createHarness();
      const decisions = await consumeTimes(harness.limiter, request.limit);
      expect(decisions.every((decision) => decision.allowed)).toBe(true);
    });

    it("counts down the remaining allowance", async () => {
      const harness = createHarness();
      const decisions = await consumeTimes(harness.limiter, request.limit);
      expect(decisions.map((decision) => decision.remaining)).toEqual([2, 1, 0]);
    });

    it("denies the request beyond the limit", async () => {
      const harness = createHarness();
      const [denied] = (await consumeTimes(harness.limiter, request.limit + 1)).slice(-1);
      expect(denied?.allowed).toBe(false);
    });

    it("tells a denied caller when to retry within the window", async () => {
      const harness = createHarness();
      const [denied] = (await consumeTimes(harness.limiter, request.limit + 1)).slice(-1);
      expect(denied?.retryAfterMilliseconds).toBeGreaterThan(0);
      expect(denied?.retryAfterMilliseconds).toBeLessThanOrEqual(request.windowMilliseconds);
    });

    it("reports no wait for an allowed request", async () => {
      const harness = createHarness();
      const [allowed] = await consumeTimes(harness.limiter, 1);
      expect(allowed?.retryAfterMilliseconds).toBe(0);
    });

    it("keeps subjects apart", async () => {
      const harness = createHarness();
      await consumeTimes(harness.limiter, request.limit);
      const [other] = await consumeTimes(harness.limiter, 1, { subject: "actor:2" });
      expect(other?.allowed).toBe(true);
    });

    it("keeps buckets apart", async () => {
      const harness = createHarness();
      await consumeTimes(harness.limiter, request.limit);
      const [other] = await consumeTimes(harness.limiter, 1, { bucket: "tenants-read" });
      expect(other?.allowed).toBe(true);
    });

    it("allows again once the window has passed", async () => {
      const harness = createHarness();
      await consumeTimes(harness.limiter, request.limit);
      harness.advanceBy(request.windowMilliseconds);
      const [again] = await consumeTimes(harness.limiter, 1);
      expect(again?.allowed).toBe(true);
    });

    it("keeps denying while the window slides", async () => {
      const harness = createHarness();
      await consumeTimes(harness.limiter, request.limit);
      harness.advanceBy(request.windowMilliseconds / 2);
      const [still] = await consumeTimes(harness.limiter, 1);
      expect(still?.allowed).toBe(false);
    });
  });
}
