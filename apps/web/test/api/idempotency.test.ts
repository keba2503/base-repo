import { describe, expect, it } from "bun:test";
import { idempotencyKeyHeader, idempotencyReplayedHeader } from "@/api";
import {
  domainError,
  errorOf,
  harnessFactory,
  ok,
  postTenant,
  secondSessionCookie,
  sessionCookie,
  tenantResponse,
  validTenantPayload,
} from "./harness";

const withKey = (key: string) => ({ cookie: sessionCookie, [idempotencyKeyHeader]: key });

describe("idempotent create with an Idempotency-Key", () => {
  it("runs the use case once and replays the stored response for the same key and payload", async () => {
    let calls = 0;
    const harness = harnessFactory({
      createTenant: () => {
        calls += 1;
        return Promise.resolve(ok(tenantResponse));
      },
    });
    const first = await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    const second = await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    expect(calls).toBe(1);
    expect(second.status).toBe(first.status);
    expect(await second.json()).toEqual(await first.json());
  });

  it("marks the replayed response", async () => {
    const harness = harnessFactory();
    await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    const second = await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    expect(second.headers.get(idempotencyReplayedHeader)).toBe("true");
  });

  it("does not mark a first response as replayed", async () => {
    const first = await postTenant(harnessFactory().api, validTenantPayload, withKey("k-1"));
    expect(first.headers.get(idempotencyReplayedHeader)).toBeNull();
  });

  it("refuses the same key with a different payload", async () => {
    const harness = harnessFactory();
    await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    const second = await postTenant(harness.api, { ...validTenantPayload, name: "Other" }, withKey("k-1"));
    expect(second.status).toBe(422);
    expect((await errorOf(second)).code).toBe("idempotency.payloadMismatch");
  });

  it("replays a stored 4xx failure, keeping the payload guard meaningful", async () => {
    const harness = harnessFactory({
      createTenant: () => Promise.resolve(domainError("conflict", "tenant.slug.taken", "taken")),
    });
    await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    const second = await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    expect(second.status).toBe(409);
    expect(second.headers.get(idempotencyReplayedHeader)).toBe("true");
  });

  it("refuses the same key with a different payload after a first call that failed", async () => {
    const harness = harnessFactory({
      createTenant: () => Promise.resolve(domainError("conflict", "tenant.slug.taken", "taken")),
    });
    await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    const second = await postTenant(harness.api, { ...validTenantPayload, name: "Other" }, withKey("k-1"));
    expect(second.status).toBe(422);
    expect((await errorOf(second)).code).toBe("idempotency.payloadMismatch");
  });

  it("does not cache a server failure, so a retry with the same key runs the use case again", async () => {
    let calls = 0;
    const harness = harnessFactory({
      createTenant: () => {
        calls += 1;
        return Promise.resolve(calls === 1 ? domainError("unavailable", "provider.unavailable", "down") : ok(tenantResponse));
      },
    });
    const first = await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    expect(first.status).toBe(503);
    const second = await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    expect(second.status).toBe(201);
    expect(second.headers.get(idempotencyReplayedHeader)).toBeNull();
    expect(calls).toBe(2);
  });

  it("keeps keys apart per actor", async () => {
    let calls = 0;
    const harness = harnessFactory({
      createTenant: () => {
        calls += 1;
        return Promise.resolve(ok(tenantResponse));
      },
    });
    await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    await postTenant(harness.api, validTenantPayload, { cookie: secondSessionCookie, [idempotencyKeyHeader]: "k-1" });
    expect(calls).toBe(2);
  });

  it("runs the use case again without a key", async () => {
    let calls = 0;
    const harness = harnessFactory({
      createTenant: () => {
        calls += 1;
        return Promise.resolve(ok(tenantResponse));
      },
    });
    await postTenant(harness.api, validTenantPayload);
    await postTenant(harness.api, validTenantPayload);
    expect(calls).toBe(2);
  });

  it("refuses a key that is not an identifier", async () => {
    const response = await postTenant(harnessFactory().api, validTenantPayload, withKey("bad key with spaces"));
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("idempotency.keyInvalid");
  });

  it("forgets the stored response once the time to live elapsed", async () => {
    let calls = 0;
    const harness = harnessFactory({
      createTenant: () => {
        calls += 1;
        return Promise.resolve(ok(tenantResponse));
      },
    });
    await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    harness.clock.advanceBy(60_000);
    await postTenant(harness.api, validTenantPayload, withKey("k-1"));
    expect(calls).toBe(2);
  });
});
