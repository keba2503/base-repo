import { describe, expect, it } from "bun:test";
import { createTenantContract } from "@base/contracts";
import type { RouteDefinition } from "@/api";
import { apiKeySecret, errorOf, getTenant, harnessFactory, ok, postTenant, sessionCookie, validTenantPayload } from "./harness";

describe("authentication for a session only operation", () => {
  it("refuses a request without credentials", async () => {
    const response = await postTenant(harnessFactory().api, validTenantPayload, {});
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("auth.required");
  });

  it("refuses an api key where only a session is accepted", async () => {
    const response = await postTenant(harnessFactory().api, validTenantPayload, {
      authorization: `Bearer ${apiKeySecret}`,
    });
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("auth.credentialNotAccepted");
  });

  it("refuses a session the resolver does not recognise", async () => {
    const response = await postTenant(harnessFactory().api, validTenantPayload, { cookie: "session=expired" });
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("auth.invalid");
  });

  it("accepts a recognised session", async () => {
    const response = await postTenant(harnessFactory().api, validTenantPayload, { cookie: sessionCookie });
    expect(response.status).toBe(201);
  });
});

describe("authentication for an operation accepting either credential", () => {
  it("accepts a recognised api key", async () => {
    const response = await getTenant(harnessFactory().api, "acme-clinic", { authorization: `Bearer ${apiKeySecret}` });
    expect(response.status).toBe(200);
  });

  it("accepts a recognised session", async () => {
    const response = await getTenant(harnessFactory().api, "acme-clinic", { cookie: sessionCookie });
    expect(response.status).toBe(200);
  });

  it("refuses an unknown api key", async () => {
    const response = await getTenant(harnessFactory().api, "acme-clinic", { authorization: "Bearer nope" });
    expect(response.status).toBe(401);
  });

  it("hands the resolved actor to the controller", async () => {
    const seen: string[] = [];
    const harness = harnessFactory({
      getTenantBySlug: (request) => {
        seen.push(request.actor.subjectId);
        return Promise.resolve(ok({ id: "1", name: "n", slug: "s", createdAt: new Date(0) }));
      },
    });
    await getTenant(harness.api, "acme-clinic");
    expect(seen).toEqual([harness.actor.subjectId]);
  });
});

describe("a public operation", () => {
  const publicRoute: RouteDefinition = {
    operationId: "ping",
    summary: "Ping",
    tag: "health",
    method: "post",
    path: "/v1/ping",
    contract: { ...createTenantContract, metadata: { ...createTenantContract.metadata, auth: "public" } },
    inputLocation: "body",
    successStatus: 200,
    execute: ({ actor }) => Promise.resolve({ kind: "ok", value: { subject: actor.subjectId } }),
  };

  it("resolves an anonymous actor when no credential is sent", async () => {
    const harness = harnessFactory({ routes: [publicRoute] });
    const response = await harness.api.request("/api/v1/ping", { method: "POST", body: "{}" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ subject: harness.actor.subjectId });
  });
});
