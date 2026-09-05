import { describe, expect, it } from "bun:test";
import type { RevokeApiKey } from "@base/application";
import { conflict, err, notFound, ok } from "@base/domain";
import { revokeApiKeyController } from "../src/index";
import { actorFactory } from "./factories/actor";
import { apiKeyResponseFactory } from "./factories/api-key-response";

const revokedAt = new Date("2026-02-01T00:00:00.000Z");
const validPayload = { apiKeyId: "00000000-0000-4000-8000-000000000001" };

describe("revoke api key controller", () => {
  it("returns the response model on success", async () => {
    const useCase: RevokeApiKey = () => Promise.resolve(ok(apiKeyResponseFactory({ revokedAt })));
    const outcome = await revokeApiKeyController(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome).toEqual({ kind: "ok", value: apiKeyResponseFactory({ revokedAt }) });
  });

  it("reports a malformed id as invalid without reaching the use case", async () => {
    let calls = 0;
    const useCase: RevokeApiKey = () => {
      calls += 1;
      return Promise.resolve(ok(apiKeyResponseFactory({ revokedAt })));
    };
    const outcome = await revokeApiKeyController(useCase)({ actor: actorFactory(), payload: { apiKeyId: "nope" } });
    expect([outcome.kind, calls]).toEqual(["invalid", 0]);
  });

  it("maps a missing key to a not found outcome", async () => {
    const useCase: RevokeApiKey = () => Promise.resolve(err(notFound("apiKey.notFound", "missing")));
    const outcome = await revokeApiKeyController(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("notFound");
  });

  it("maps a second revocation to a conflict outcome", async () => {
    const useCase: RevokeApiKey = () => Promise.resolve(err(conflict("apiKey.alreadyRevoked", "twice")));
    const outcome = await revokeApiKeyController(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("conflict");
  });
});
