import { describe, expect, it } from "bun:test";
import type { CreateApiKey } from "@base/application";
import { err, forbidden, invariantViolation, ok } from "@base/domain";
import { createApiKeyController } from "../src/index";
import { actorFactory } from "./factories/actor";
import { apiKeyCreatedResponseFactory } from "./factories/api-key-response";

const validPayload = { name: "Integration", scopes: ["tenants:read"] };

const succeedingUseCase: CreateApiKey = () => Promise.resolve(ok(apiKeyCreatedResponseFactory()));

describe("create api key controller", () => {
  it("returns the response model on success", async () => {
    const outcome = await createApiKeyController(succeedingUseCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome).toEqual({ kind: "ok", value: apiKeyCreatedResponseFactory() });
  });

  it("hands the parsed input to the use case", async () => {
    const seen: unknown[] = [];
    const useCase: CreateApiKey = (request) => {
      seen.push({ name: request.name, scopes: request.scopes });
      return Promise.resolve(ok(apiKeyCreatedResponseFactory()));
    };
    await createApiKeyController(useCase)({ actor: actorFactory(), payload: { name: " Integration ", scopes: ["tenants:read"] } });
    expect(seen).toEqual([validPayload]);
  });

  it("never reaches the use case with an invalid payload", async () => {
    let calls = 0;
    const useCase: CreateApiKey = () => {
      calls += 1;
      return Promise.resolve(ok(apiKeyCreatedResponseFactory()));
    };
    await createApiKeyController(useCase)({ actor: actorFactory(), payload: { name: "", scopes: [] } });
    expect(calls).toBe(0);
  });

  it("reports contract violations as invalid", async () => {
    const outcome = await createApiKeyController(succeedingUseCase)({ actor: actorFactory(), payload: { name: "x" } });
    if (outcome.kind !== "invalid") throw new Error("Expected an invalid outcome");
    expect(outcome.issues.map((issue) => issue.path)).toEqual(["scopes"]);
  });

  it("maps a forbidden domain error to a forbidden outcome", async () => {
    const useCase: CreateApiKey = () => Promise.resolve(err(forbidden("apiKey.scopes.escalation", "denied")));
    const outcome = await createApiKeyController(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("forbidden");
  });

  it("maps an invariant violation to an invalid outcome carrying its code", async () => {
    const useCase: CreateApiKey = () => Promise.resolve(err(invariantViolation("apiKey.name.length", "short")));
    const outcome = await createApiKeyController(useCase)({ actor: actorFactory(), payload: validPayload });
    if (outcome.kind !== "invalid") throw new Error("Expected an invalid outcome");
    expect(outcome.issues.map((issue) => issue.code)).toEqual(["apiKey.name.length"]);
  });
});
