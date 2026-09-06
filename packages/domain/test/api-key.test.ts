import { describe, expect, it } from "bun:test";
import { isErr, isOk } from "../src/kernel/result";
import {
  ApiKey,
  apiKeyFieldClassifications,
  apiKeyPrefixOf,
  composeApiKey,
  splitApiKey,
  type ApiKeySnapshot,
} from "../src/identity/api-key";
import type { PermissionAction } from "../src/identity/role";
import { apiKeySnapshotFactory, entityIdFactory } from "./factories/identity";

const createdAt = new Date("2026-01-15T10:00:00.000Z");
const later = new Date("2026-01-16T10:00:00.000Z");

function createFailureCode(snapshot: ApiKeySnapshot): string {
  const result = ApiKey.create(snapshot);
  if (isOk(result)) throw new Error("Expected the api key to be rejected");
  return result.error.code;
}

function createdKey(overrides: Partial<ApiKeySnapshot> = {}): ApiKey {
  const result = ApiKey.create(apiKeySnapshotFactory(overrides));
  if (!isOk(result)) throw new Error(`Expected the api key to be accepted, received ${result.error.code}`);
  return result.value;
}

describe("api key format", () => {
  it("derives the prefix from the key id without hyphens", () => {
    expect(apiKeyPrefixOf(entityIdFactory(255))).toBe("ak_000000000000400080000000000000ff");
  });

  it("composes and splits a plaintext key symmetrically", () => {
    const keyPrefix = apiKeyPrefixOf(entityIdFactory(1));
    const plaintext = composeApiKey({ keyPrefix, secret: "s3cr3t" });
    expect(splitApiKey(plaintext)).toEqual({ kind: "ok", value: { keyPrefix, secret: "s3cr3t" } });
  });

  it("keeps dots inside the secret when splitting", () => {
    const keyPrefix = apiKeyPrefixOf(entityIdFactory(1));
    const result = splitApiKey(`${keyPrefix}.a.b`);
    if (!isOk(result)) throw new Error("Expected the key to split");
    expect(result.value.secret).toBe("a.b");
  });

  it("rejects a key without a separator", () => {
    expect(isErr(splitApiKey("ak_00000000000040008000000000000001"))).toBe(true);
  });

  it("rejects a key with a malformed prefix", () => {
    expect(isErr(splitApiKey("sk_live.secret"))).toBe(true);
  });

  it("rejects a key with an empty secret", () => {
    expect(isErr(splitApiKey("ak_00000000000040008000000000000001."))).toBe(true);
  });
});

describe("api key creation", () => {
  it("accepts a valid key", () => {
    expect(isOk(ApiKey.create(apiKeySnapshotFactory()))).toBe(true);
  });

  it("starts unrevoked", () => {
    expect(createdKey().isRevoked).toBe(false);
  });

  it("records a creation event", () => {
    const apiKey = createdKey();
    expect(apiKey.pullEvents()).toEqual([
      {
        name: "apikey.created",
        tenantId: apiKey.tenantId,
        occurredAt: createdAt,
        payload: { apiKeyId: apiKey.id, keyPrefix: apiKey.keyPrefix, scopes: ["tenants:read"] },
      },
    ]);
  });

  it("trims the name", () => {
    expect(createdKey({ name: "  Integration  " }).name).toBe("Integration");
  });

  it("rejects an empty name", () => {
    expect(createFailureCode(apiKeySnapshotFactory({ name: " " }))).toBe("apiKey.name.length");
  });

  it("rejects a prefix that does not match the key format", () => {
    expect(createFailureCode(apiKeySnapshotFactory({ keyPrefix: "ak_short" }))).toBe("apiKey.prefix.format");
  });

  it("rejects an empty hash", () => {
    expect(createFailureCode(apiKeySnapshotFactory({ keyHash: "" }))).toBe("apiKey.hash.empty");
  });

  it("rejects an empty scope list", () => {
    expect(createFailureCode(apiKeySnapshotFactory({ scopes: [] }))).toBe("apiKey.scopes.empty");
  });

  it("rejects a repeated scope", () => {
    expect(createFailureCode(apiKeySnapshotFactory({ scopes: ["tenants:read", "tenants:read"] }))).toBe(
      "apiKey.scopes.duplicate",
    );
  });

  it("rejects an unknown scope", () => {
    const scopes = ["tenants:destroy" as PermissionAction];
    expect(createFailureCode(apiKeySnapshotFactory({ scopes }))).toBe("apiKey.scopes.unknown");
  });

  it("copies the scopes so callers cannot mutate them", () => {
    const scopes: PermissionAction[] = ["tenants:read"];
    const apiKey = createdKey({ scopes });
    scopes.push("apikeys:manage");
    expect(apiKey.scopes).toEqual(["tenants:read"]);
  });
});

describe("api key revocation", () => {
  it("marks the key as revoked at the given instant", () => {
    const apiKey = createdKey();
    apiKey.pullEvents();
    const result = apiKey.revoke(later);
    expect([isOk(result), apiKey.isRevoked, apiKey.revokedAt]).toEqual([true, true, later]);
  });

  it("records a revocation event", () => {
    const apiKey = createdKey();
    apiKey.pullEvents();
    apiKey.revoke(later);
    expect(apiKey.pullEvents()).toEqual([
      {
        name: "apikey.revoked",
        tenantId: apiKey.tenantId,
        occurredAt: later,
        payload: { apiKeyId: apiKey.id, keyPrefix: apiKey.keyPrefix },
      },
    ]);
  });

  it("refuses to revoke twice", () => {
    const apiKey = createdKey();
    apiKey.revoke(later);
    const result = apiKey.revoke(later);
    if (isOk(result)) throw new Error("Expected the second revocation to be rejected");
    expect(result.error.code).toBe("apiKey.alreadyRevoked");
  });

  it("refuses a revocation before the creation", () => {
    const result = createdKey().revoke(new Date("2020-01-01T00:00:00.000Z"));
    if (isOk(result)) throw new Error("Expected the revocation to be rejected");
    expect(result.error.code).toBe("apiKey.revokedAt.beforeCreation");
  });

  it("restores a revoked key as revoked", () => {
    const result = ApiKey.restore(apiKeySnapshotFactory({ revokedAt: later }));
    if (!isOk(result)) throw new Error("Expected the key to be accepted");
    expect(result.value.isRevoked).toBe(true);
  });

  it("rejects a stored revocation before the creation", () => {
    const result = ApiKey.restore(apiKeySnapshotFactory({ revokedAt: new Date("2020-01-01T00:00:00.000Z") }));
    expect(isErr(result)).toBe(true);
  });

  it("carries the revocation in its snapshot", () => {
    const apiKey = createdKey();
    apiKey.revoke(later);
    expect(apiKey.toSnapshot().revokedAt).toEqual(later);
  });
});

describe("api key restoration", () => {
  it("does not record an event", () => {
    const result = ApiKey.restore(apiKeySnapshotFactory());
    if (!isOk(result)) throw new Error("Expected the key to be accepted");
    expect(result.value.pullEvents()).toEqual([]);
  });
});

describe("api key data classification", () => {
  it("declares the hash as sensitive so it never reaches a log line", () => {
    expect(apiKeyFieldClassifications.keyHash).toBe("sensitive");
  });
});
