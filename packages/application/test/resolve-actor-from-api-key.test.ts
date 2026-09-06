import { describe, expect, it } from "bun:test";
import { composeApiKey, isErr, isOk } from "@base/domain";
import { resolveActorFromApiKey, type ResolveActorFromApiKey } from "../src/index";
import { tenantIdFactory } from "./factories/actor";
import { apiKeyFactory, entityIdFactory } from "./factories/identity";
import { StubApiKeyHasher, StubApiKeyRepository } from "./doubles/identity-ports";

const hasher = new StubApiKeyHasher();
const keyId = entityIdFactory(20);

async function harnessFactory(revokedAt: Date | null = null): Promise<{
  useCase: ResolveActorFromApiKey;
  plaintext: string;
}> {
  const prefix = apiKeyFactory({ id: keyId }).keyPrefix;
  const plaintext = composeApiKey({ keyPrefix: prefix, secret: "s3cr3t" });
  const apiKeys = new StubApiKeyRepository();
  apiKeys.seed(
    apiKeyFactory({
      id: keyId,
      keyHash: await hasher.hash({ key: plaintext }),
      scopes: ["tenants:read", "apikeys:manage"],
      revokedAt,
    }),
  );
  return { useCase: resolveActorFromApiKey({ apiKeys, hasher }), plaintext };
}

describe("resolving an actor from an api key", () => {
  it("builds an api key actor carrying the stored scopes", async () => {
    const harness = await harnessFactory();
    const result = await harness.useCase({ key: harness.plaintext });
    if (!isOk(result)) throw new Error(`Expected an actor, received ${result.error.code}`);
    expect(result.value).toEqual({
      tenantId: tenantIdFactory(900),
      subjectId: keyId,
      kind: "apiKey",
      scopes: ["tenants:read", "apikeys:manage"],
    });
  });

  it("refuses a key with the right prefix and a wrong secret", async () => {
    const harness = await harnessFactory();
    const result = await harness.useCase({ key: `${harness.plaintext}x` });
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.code).toBe("identity.apiKey.invalid");
  });

  it("refuses a key whose prefix is unknown", async () => {
    const harness = await harnessFactory();
    const unknown = composeApiKey({ keyPrefix: apiKeyFactory({ id: entityIdFactory(21) }).keyPrefix, secret: "s3cr3t" });
    const result = await harness.useCase({ key: unknown });
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.code).toBe("identity.apiKey.invalid");
  });

  it("refuses a malformed key", async () => {
    const harness = await harnessFactory();
    const result = await harness.useCase({ key: "not-a-key" });
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.kind).toBe("forbidden");
  });

  it("refuses a revoked key", async () => {
    const harness = await harnessFactory(new Date("2026-02-01T00:00:00.000Z"));
    const result = await harness.useCase({ key: harness.plaintext });
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.code).toBe("identity.apiKey.revoked");
  });
});
