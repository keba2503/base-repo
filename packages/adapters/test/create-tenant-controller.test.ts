import { describe, expect, it } from "bun:test";
import type { CreateTenant } from "@base/application";
import { conflict, err, forbidden, invariantViolation, notFound, ok } from "@base/domain";
import { createTenantController } from "../src/index";
import { actorFactory } from "./factories/actor";
import { tenantResponseFactory } from "./factories/tenant-response";

const validPayload = { name: "Acme Clinic", slug: "acme-clinic" };

function controllerOver(useCase: CreateTenant) {
  return createTenantController(useCase);
}

const succeedingUseCase: CreateTenant = () => Promise.resolve(ok(tenantResponseFactory()));

describe("create tenant controller", () => {
  it("returns the response model on success", async () => {
    const outcome = await controllerOver(succeedingUseCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome).toEqual({ kind: "ok", value: tenantResponseFactory() });
  });

  it("hands the parsed input to the use case", async () => {
    const seen: unknown[] = [];
    const useCase: CreateTenant = (request) => {
      seen.push({ name: request.name, slug: request.slug });
      return Promise.resolve(ok(tenantResponseFactory()));
    };
    await controllerOver(useCase)({ actor: actorFactory(), payload: { name: "  Acme Clinic  ", slug: "acme-clinic" } });
    expect(seen).toEqual([validPayload]);
  });

  it("never reaches the use case with an invalid payload", async () => {
    let calls = 0;
    const useCase: CreateTenant = () => {
      calls += 1;
      return Promise.resolve(ok(tenantResponseFactory()));
    };
    await controllerOver(useCase)({ actor: actorFactory(), payload: { name: "a", slug: "A" } });
    expect(calls).toBe(0);
  });

  it("reports contract violations as invalid", async () => {
    const outcome = await controllerOver(succeedingUseCase)({ actor: actorFactory(), payload: { slug: "acme-clinic" } });
    if (outcome.kind !== "invalid") throw new Error("Expected an invalid outcome");
    expect(outcome.issues.map((issue) => issue.path)).toEqual(["name"]);
  });

  it("maps a forbidden domain error to a forbidden outcome", async () => {
    const useCase: CreateTenant = () => Promise.resolve(err(forbidden("authorization.denied", "denied")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("forbidden");
  });

  it("maps a conflict domain error to a conflict outcome", async () => {
    const useCase: CreateTenant = () => Promise.resolve(err(conflict("tenant.slug.taken", "taken")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("conflict");
  });

  it("maps a not found domain error to a not found outcome", async () => {
    const useCase: CreateTenant = () => Promise.resolve(err(notFound("tenant.notFound", "missing")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("notFound");
  });

  it("maps an invariant violation to an invalid outcome carrying its code", async () => {
    const useCase: CreateTenant = () => Promise.resolve(err(invariantViolation("tenant.name.length", "too short")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    if (outcome.kind !== "invalid") throw new Error("Expected an invalid outcome");
    expect(outcome.issues.map((issue) => issue.code)).toEqual(["tenant.name.length"]);
  });
});
