import { describe, expect, it } from "bun:test";
import { createTenantContract } from "@base/contracts";
import { humanTokenHeader, type RouteDefinition } from "@/api";
import { errorOf, harnessFactory, recognisedHumanToken, sessionCookie } from "./harness";

const guardedRoute: RouteDefinition = {
  operationId: "guardedPing",
  summary: "Guarded ping",
  tag: "health",
  method: "post",
  path: "/v1/guarded",
  contract: { ...createTenantContract, metadata: { ...createTenantContract.metadata, humanCheck: true } },
  inputLocation: "body",
  successStatus: 200,
  execute: () => Promise.resolve({ kind: "ok", value: { pong: true } }),
};

function call(token: string | undefined) {
  const headers: Record<string, string> = { cookie: sessionCookie, "content-type": "application/json" };
  if (token !== undefined) headers[humanTokenHeader] = token;
  return harnessFactory({ routes: [guardedRoute] }).api.request("/api/v1/guarded", { method: "POST", headers, body: "{}" });
}

describe("human check on a guarded operation", () => {
  it("answers 422 when the token header is missing", async () => {
    const response = await call(undefined);
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("humanCheck.tokenMissing");
  });

  it("answers 403 when the verifier rejects the token", async () => {
    const response = await call("not-a-human");
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("humanCheck.rejected");
  });

  it("proceeds when the verifier accepts the token", async () => {
    const response = await call(recognisedHumanToken);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pong: true });
  });
});
