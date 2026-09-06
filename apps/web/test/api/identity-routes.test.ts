import { describe, expect, it } from "bun:test";
import {
  apiKeyCreatedOutput,
  apiKeyRevokedOutput,
  domainError,
  errorOf,
  harnessFactory,
  postApiKey,
  postRevokeApiKey,
  validCreateApiKeyPayload,
  validRevokeApiKeyPayload,
} from "./harness";

describe("POST /api/v1/api-keys", () => {
  it("answers 201 with the contract output on success", async () => {
    const response = await postApiKey(harnessFactory().api, validCreateApiKeyPayload);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(apiKeyCreatedOutput);
  });

  it("answers 422 with the issues when the payload breaks the contract", async () => {
    const response = await postApiKey(harnessFactory().api, { name: "" });
    const error = await errorOf(response);
    expect(response.status).toBe(422);
    expect(error.code).toBe("request.invalid");
  });

  it("answers 422 carrying the domain code when the api key name is invalid", async () => {
    const harness = harnessFactory({
      createApiKey: () => Promise.resolve(domainError("invariantViolation", "apiKey.name.length", "too short")),
    });
    const response = await postApiKey(harness.api, validCreateApiKeyPayload);
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("apiKey.name.length");
  });

  it("answers 403 when the use case forbids the actor", async () => {
    const harness = harnessFactory({
      createApiKey: () => Promise.resolve(domainError("forbidden", "authorization.denied", "denied")),
    });
    const response = await postApiKey(harness.api, validCreateApiKeyPayload);
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("authorization.denied");
  });

  it("answers 403 when a scope is escalated beyond the actor own grants", async () => {
    const harness = harnessFactory({
      createApiKey: () =>
        Promise.resolve(domainError("forbidden", "apiKey.scopes.escalation", "cannot grant a scope you lack")),
    });
    const response = await postApiKey(harness.api, validCreateApiKeyPayload);
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("apiKey.scopes.escalation");
  });
});

describe("POST /api/v1/api-keys/revoke", () => {
  it("answers 200 with the contract output on success", async () => {
    const response = await postRevokeApiKey(harnessFactory().api, validRevokeApiKeyPayload);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(apiKeyRevokedOutput);
  });

  it("answers 422 with the issues when the payload breaks the contract", async () => {
    const response = await postRevokeApiKey(harnessFactory().api, { apiKeyId: "not-a-uuid" });
    const error = await errorOf(response);
    expect(response.status).toBe(422);
    expect(error.code).toBe("request.invalid");
  });

  it("answers 409 when the key was already revoked", async () => {
    const harness = harnessFactory({
      revokeApiKey: () =>
        Promise.resolve(domainError("conflict", "apiKey.alreadyRevoked", "this key was already revoked")),
    });
    const response = await postRevokeApiKey(harness.api, validRevokeApiKeyPayload);
    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("apiKey.alreadyRevoked");
  });

  it("answers 403 when the use case forbids the actor", async () => {
    const harness = harnessFactory({
      revokeApiKey: () => Promise.resolve(domainError("forbidden", "authorization.denied", "denied")),
    });
    const response = await postRevokeApiKey(harness.api, validRevokeApiKeyPayload);
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("authorization.denied");
  });
});
