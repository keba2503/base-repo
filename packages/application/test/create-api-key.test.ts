import { beforeEach, describe, expect, it } from "bun:test";
import { isErr, isOk, type DomainError, type Result } from "@base/domain";
import { createApiKey, type ApiKeyCreatedResponse, type CreateApiKey } from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import { StubApiKeyHasher, StubApiKeyRepository, StubSecretGenerator } from "./doubles/identity-ports";
import { StubClock, StubIdGenerator, StubOutbox, StubPermissions, StubUnitOfWork } from "./doubles/ports";

const createdAt = new Date("2026-01-15T10:00:00.000Z");

type Harness = {
  useCase: CreateApiKey;
  apiKeys: StubApiKeyRepository;
  outbox: StubOutbox;
  unitOfWork: StubUnitOfWork;
  permissions: StubPermissions;
};

function harnessFactory(granted: readonly string[] = ["apikeys:manage", "tenants:read"]): Harness {
  const apiKeys = new StubApiKeyRepository();
  const outbox = new StubOutbox();
  const unitOfWork = new StubUnitOfWork();
  const permissions = new StubPermissions(granted);
  const useCase = createApiKey({
    apiKeysScopedTo: (tenantId) => apiKeys.scopedTo(tenantId),
    permissions,
    clock: new StubClock(createdAt),
    idGenerator: new StubIdGenerator(),
    secretGenerator: new StubSecretGenerator(),
    hasher: new StubApiKeyHasher(),
    unitOfWork,
    outbox,
  });
  return { useCase, apiKeys, outbox, unitOfWork, permissions };
}

function expectOk(result: Result<ApiKeyCreatedResponse, DomainError>): ApiKeyCreatedResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

function expectErr(result: Result<ApiKeyCreatedResponse, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

const request = { actor: actorFactory(), name: "Integration", scopes: ["tenants:read"] };

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("creating an api key", () => {
  it("returns the plaintext key exactly once alongside its metadata", async () => {
    expect(expectOk(await harness.useCase(request))).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      tenantId: tenantIdFactory(900),
      name: "Integration",
      keyPrefix: "ak_00000000000040008000000000000001",
      scopes: ["tenants:read"],
      createdAt,
      revokedAt: null,
      plaintextKey: "ak_00000000000040008000000000000001.secret-1",
    });
  });

  it("stores the hash instead of the plaintext", async () => {
    const response = expectOk(await harness.useCase(request));
    const [stored] = harness.apiKeys.saved;
    expect([stored?.keyHash, stored?.keyHash === response.plaintextKey]).toEqual([
      `hashed:${response.plaintextKey}`,
      false,
    ]);
  });

  it("scopes the repository to the actor tenant", async () => {
    await harness.useCase(request);
    expect(harness.apiKeys.scopesRequested).toEqual([tenantIdFactory(900)]);
  });

  it("persists inside a single unit of work", async () => {
    await harness.useCase(request);
    expect(harness.unitOfWork.runs).toBe(1);
  });

  it("enqueues the creation event", async () => {
    await harness.useCase(request);
    expect(harness.outbox.events.map((event) => event.name)).toEqual(["apikey.created"]);
  });

  it("asks the permissions port for the manage action and then for every scope", async () => {
    await harness.useCase(request);
    expect(harness.permissions.requests.map((seen) => seen.action)).toEqual(["apikeys:manage", "tenants:read"]);
  });

  it("asks each scope against its own resource, not the api key being created", async () => {
    const granting = harnessFactory(["apikeys:manage", "tenants:read", "members:manage"]);
    await granting.useCase({ ...request, scopes: ["tenants:read", "members:manage"] });
    expect(granting.permissions.requests.map((seen) => seen.resource)).toEqual(["apiKey", "tenant", "member"]);
  });
});

describe("rejecting an api key", () => {
  it("refuses an actor without the manage permission", async () => {
    const denied = harnessFactory(["tenants:read"]);
    expect(expectErr(await denied.useCase(request)).kind).toBe("forbidden");
  });

  it("refuses a scope the actor does not hold itself", async () => {
    const limited = harnessFactory(["apikeys:manage"]);
    expect(expectErr(await limited.useCase(request)).code).toBe("apiKey.scopes.escalation");
  });

  it("refuses an unknown scope before asking permissions for it", async () => {
    const error = expectErr(await harness.useCase({ ...request, scopes: ["tenants:destroy"] }));
    expect([error.code, harness.permissions.requests.length]).toEqual(["apiKey.scopes.unknown", 1]);
  });

  it("refuses an empty scope list", async () => {
    expect(expectErr(await harness.useCase({ ...request, scopes: [] })).code).toBe("apiKey.scopes.empty");
  });

  it("refuses a name that breaks the domain invariant", async () => {
    expect(expectErr(await harness.useCase({ ...request, name: " " })).code).toBe("apiKey.name.length");
  });

  it("writes nothing when the actor is not allowed", async () => {
    const denied = harnessFactory([]);
    await denied.useCase(request);
    expect([denied.apiKeys.saved, denied.outbox.events]).toEqual([[], []]);
  });
});
