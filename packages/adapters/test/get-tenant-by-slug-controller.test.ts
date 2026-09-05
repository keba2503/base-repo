import { describe, expect, it } from "bun:test";
import type { GetTenantBySlug } from "@base/application";
import { err, notFound, ok } from "@base/domain";
import { getTenantBySlugController } from "../src/index";
import { actorFactory } from "./factories/actor";
import { tenantResponseFactory } from "./factories/tenant-response";

describe("get tenant by slug controller", () => {
  it("returns the response model on success", async () => {
    const useCase: GetTenantBySlug = () => Promise.resolve(ok(tenantResponseFactory()));
    const outcome = await getTenantBySlugController(useCase)({ actor: actorFactory(), slug: "acme-clinic" });
    expect(outcome).toEqual({ kind: "ok", value: tenantResponseFactory() });
  });

  it("maps a missing tenant to a not found outcome", async () => {
    const useCase: GetTenantBySlug = () => Promise.resolve(err(notFound("tenant.notFound", "missing")));
    const outcome = await getTenantBySlugController(useCase)({ actor: actorFactory(), slug: "unknown" });
    expect(outcome.kind).toBe("notFound");
  });
});
