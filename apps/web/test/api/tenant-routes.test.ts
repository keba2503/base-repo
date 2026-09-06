import { describe, expect, it } from "bun:test";
import { requestIdHeader } from "@/api";
import {
  domainError,
  errorOf,
  getTenant,
  harnessFactory,
  postTenant,
  tenantOutput,
  validTenantPayload,
} from "./harness";

describe("POST /api/v1/tenants", () => {
  it("answers 201 with the contract output on success", async () => {
    const response = await postTenant(harnessFactory().api, validTenantPayload);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(tenantOutput);
  });

  it("answers 422 with the issues when the payload breaks the contract", async () => {
    const response = await postTenant(harnessFactory().api, { slug: "acme-clinic" });
    const error = await errorOf(response);
    expect(response.status).toBe(422);
    expect(error.code).toBe("request.invalid");
    expect(error.issues).toEqual([expect.objectContaining({ path: "name" })]);
  });

  it("answers 422 carrying the domain code when an invariant is broken", async () => {
    const harness = harnessFactory({
      createTenant: () => Promise.resolve(domainError("invariantViolation", "tenant.name.length", "too short")),
    });
    const response = await postTenant(harness.api, validTenantPayload);
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("tenant.name.length");
  });

  it("answers 403 when the use case forbids the actor", async () => {
    const harness = harnessFactory({
      createTenant: () => Promise.resolve(domainError("forbidden", "authorization.denied", "denied")),
    });
    const response = await postTenant(harness.api, validTenantPayload);
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("authorization.denied");
  });

  it("answers 409 when the use case reports a conflict", async () => {
    const harness = harnessFactory({
      createTenant: () => Promise.resolve(domainError("conflict", "tenant.slug.taken", "taken")),
    });
    const response = await postTenant(harness.api, validTenantPayload);
    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("tenant.slug.taken");
  });

  it("answers 422 when the body is not JSON", async () => {
    const response = await postTenant(harnessFactory().api, "{not json");
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("request.malformedJson");
  });

  it("answers 500 with the envelope when the use case throws", async () => {
    const harness = harnessFactory({ createTenant: () => Promise.reject(new Error("database down")) });
    const response = await postTenant(harness.api, validTenantPayload);
    const error = await errorOf(response);
    expect(response.status).toBe(500);
    expect(error.code).toBe("internal.error");
    expect(error.message).not.toContain("database down");
  });
});

describe("GET /api/v1/tenants/{slug}", () => {
  it("answers 200 with the contract output on success", async () => {
    const response = await getTenant(harnessFactory().api, "acme-clinic");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(tenantOutput);
  });

  it("answers 404 when the tenant does not exist", async () => {
    const harness = harnessFactory({
      getTenantBySlug: () => Promise.resolve(domainError("notFound", "tenant.notFound", "missing")),
    });
    const response = await getTenant(harness.api, "missing");
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("tenant.notFound");
  });

  it("answers 422 when the slug breaks the contract before reaching the controller", async () => {
    let calls = 0;
    const harness = harnessFactory({
      getTenantBySlug: () => {
        calls += 1;
        return Promise.resolve(domainError("notFound", "tenant.notFound", "missing"));
      },
    });
    const response = await getTenant(harness.api, "UPPER");
    expect(response.status).toBe(422);
    expect(calls).toBe(0);
  });
});

describe("request id", () => {
  it("echoes the request id it receives", async () => {
    const response = await getTenant(harnessFactory().api, "acme-clinic", {
      authorization: "Bearer key-with-scopes",
      [requestIdHeader]: "trace-123",
    });
    expect(response.headers.get(requestIdHeader)).toBe("trace-123");
  });

  it("generates a request id when none is given", async () => {
    const response = await getTenant(harnessFactory().api, "acme-clinic");
    expect(response.headers.get(requestIdHeader)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("puts the request id inside the error envelope", async () => {
    const response = await getTenant(harnessFactory().api, "acme-clinic", { [requestIdHeader]: "trace-401" });
    expect((await errorOf(response)).requestId).toBe("trace-401");
  });

  it("replaces a request id that does not look like an identifier", async () => {
    const response = await getTenant(harnessFactory().api, "acme-clinic", {
      authorization: "Bearer key-with-scopes",
      [requestIdHeader]: "<script>alert(1)</script>",
    });
    expect(response.headers.get(requestIdHeader)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("unknown routes", () => {
  it("answers 404 with the envelope", async () => {
    const response = await harnessFactory().api.request("/api/v1/nothing");
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("route.notFound");
  });
});
