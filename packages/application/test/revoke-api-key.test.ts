import { beforeEach, describe, expect, it } from "bun:test";
import { isErr, isOk, type DomainError, type Result } from "@base/domain";
import { revokeApiKey, type ApiKeyResponse, type RevokeApiKey } from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import { apiKeyFactory, entityIdFactory } from "./factories/identity";
import { StubApiKeyRepository } from "./doubles/identity-ports";
import { StubAuditTrail, StubClock, StubOutbox, StubPermissions, StubUnitOfWork } from "./doubles/ports";

const revokedAt = new Date("2026-02-01T00:00:00.000Z");
const ownKeyId = entityIdFactory(20);
const foreignKeyId = entityIdFactory(21);

type Harness = {
  useCase: RevokeApiKey;
  apiKeys: StubApiKeyRepository;
  outbox: StubOutbox;
  unitOfWork: StubUnitOfWork;
  audit: StubAuditTrail;
};

function harnessFactory(granted: readonly string[] = ["apikeys:manage"]): Harness {
  const apiKeys = new StubApiKeyRepository();
  apiKeys.seed(apiKeyFactory({ id: ownKeyId }));
  apiKeys.seed(apiKeyFactory({ id: foreignKeyId, tenantId: tenantIdFactory(901) }));
  const outbox = new StubOutbox();
  const unitOfWork = new StubUnitOfWork();
  const audit = new StubAuditTrail();
  const useCase = revokeApiKey({
    apiKeysScopedTo: (tenantId) => apiKeys.scopedTo(tenantId),
    auditScopedTo: () => audit,
    permissions: new StubPermissions(granted),
    clock: new StubClock(revokedAt),
    unitOfWork,
    outbox,
  });
  return { useCase, apiKeys, outbox, unitOfWork, audit };
}

function expectOk(result: Result<ApiKeyResponse, DomainError>): ApiKeyResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

function expectErr(result: Result<ApiKeyResponse, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("revoking an api key", () => {
  it("returns the key marked as revoked", async () => {
    const response = expectOk(await harness.useCase({ actor: actorFactory(), apiKeyId: ownKeyId }));
    expect([response.id, response.revokedAt]).toEqual([ownKeyId, revokedAt]);
  });

  it("stores the revocation", async () => {
    await harness.useCase({ actor: actorFactory(), apiKeyId: ownKeyId });
    const stored = harness.apiKeys.saved.find((apiKey) => apiKey.id === ownKeyId);
    expect(stored?.isRevoked).toBe(true);
  });

  it("enqueues the revocation event inside one unit of work", async () => {
    await harness.useCase({ actor: actorFactory(), apiKeyId: ownKeyId });
    expect([harness.outbox.events.map((event) => event.name), harness.unitOfWork.runs]).toEqual([
      ["apikey.revoked"],
      1,
    ]);
  });
});

describe("refusing a revocation", () => {
  it("refuses an actor without the manage permission", async () => {
    const denied = harnessFactory([]);
    expect(expectErr(await denied.useCase({ actor: actorFactory(), apiKeyId: ownKeyId })).kind).toBe("forbidden");
  });

  it("reports a key of another tenant as not found", async () => {
    expect(expectErr(await harness.useCase({ actor: actorFactory(), apiKeyId: foreignKeyId })).code).toBe(
      "apiKey.notFound",
    );
  });

  it("reports a malformed id as not found", async () => {
    expect(expectErr(await harness.useCase({ actor: actorFactory(), apiKeyId: "nope" })).code).toBe(
      "apiKey.notFound",
    );
  });

  it("refuses to revoke twice", async () => {
    await harness.useCase({ actor: actorFactory(), apiKeyId: ownKeyId });
    expect(expectErr(await harness.useCase({ actor: actorFactory(), apiKeyId: ownKeyId })).code).toBe(
      "apiKey.alreadyRevoked",
    );
  });
});
