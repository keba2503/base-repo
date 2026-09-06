import { describe, expect, it } from "bun:test";
import { rateLimitLimitHeader, rateLimitRemainingHeader, retryAfterHeader } from "@/api";
import { errorOf, getTenant, harnessFactory, secondApiKeySecret } from "./harness";

const tightLimits = { "tenants-read": { limit: 2, windowMilliseconds: 10_000 } };

describe("rate limiting by contract bucket", () => {
  it("answers 429 once the bucket is exhausted", async () => {
    const harness = harnessFactory({ rateLimits: tightLimits });
    await getTenant(harness.api, "acme-clinic");
    await getTenant(harness.api, "acme-clinic");
    const third = await getTenant(harness.api, "acme-clinic");
    expect(third.status).toBe(429);
    expect((await errorOf(third)).code).toBe("rateLimit.exceeded");
  });

  it("tells when to retry in whole seconds", async () => {
    const harness = harnessFactory({ rateLimits: tightLimits });
    await getTenant(harness.api, "acme-clinic");
    await getTenant(harness.api, "acme-clinic");
    const third = await getTenant(harness.api, "acme-clinic");
    expect(third.headers.get(retryAfterHeader)).toBe("10");
  });

  it("exposes the limit and the remaining allowance on allowed responses", async () => {
    const harness = harnessFactory({ rateLimits: tightLimits });
    const first = await getTenant(harness.api, "acme-clinic");
    expect(first.headers.get(rateLimitLimitHeader)).toBe("2");
    expect(first.headers.get(rateLimitRemainingHeader)).toBe("1");
  });

  it("counts per credential", async () => {
    const harness = harnessFactory({ rateLimits: tightLimits });
    await getTenant(harness.api, "acme-clinic");
    await getTenant(harness.api, "acme-clinic");
    const other = await getTenant(harness.api, "acme-clinic", { authorization: `Bearer ${secondApiKeySecret}` });
    expect(other.status).toBe(200);
  });

  it("limits before authenticating so unknown credentials cannot hammer the resolver", async () => {
    const harness = harnessFactory({ rateLimits: tightLimits });
    await getTenant(harness.api, "acme-clinic", { authorization: "Bearer nope" });
    await getTenant(harness.api, "acme-clinic", { authorization: "Bearer nope" });
    const third = await getTenant(harness.api, "acme-clinic", { authorization: "Bearer nope" });
    expect(third.status).toBe(429);
  });

  it("allows again once the window has passed", async () => {
    const harness = harnessFactory({ rateLimits: tightLimits });
    await getTenant(harness.api, "acme-clinic");
    await getTenant(harness.api, "acme-clinic");
    harness.clock.advanceBy(10_000);
    const again = await getTenant(harness.api, "acme-clinic");
    expect(again.status).toBe(200);
  });

  it("falls back to the default bucket when the contract names an unknown one", async () => {
    const harness = harnessFactory({ rateLimits: { default: { limit: 1, windowMilliseconds: 10_000 } } });
    await getTenant(harness.api, "acme-clinic");
    const second = await getTenant(harness.api, "acme-clinic");
    expect(second.status).toBe(429);
  });
});
