import { describe, expect, it } from "bun:test";
import { RolePermissions } from "@base/application";
import { entityIdOf, isErr, isOk } from "@base/domain";
import { AuthApiError } from "@supabase/supabase-js";
import {
  InMemoryApiKeyHasher,
  InMemoryApiKeyRepository,
  InMemoryApiKeyStore,
  InMemoryIdentityProvider,
  InMemoryMembershipRepository,
  InMemoryMembershipStore,
  InMemoryUserRepository,
  InMemoryUserStore,
  RandomSecretGenerator,
  SequentialSecretGenerator,
  Sha256ApiKeyHasher,
  SupabaseIdentityProvider,
  sha256HashMarker,
  type SupabaseSessionClient,
} from "@base/infrastructure";
import {
  describeApiKeyHasherContract,
  describeApiKeyRepositoryContract,
  describeIdentityProviderContract,
  describeMembershipRepositoryContract,
  describePermissionsContract,
  describeSecretGeneratorContract,
  describeUserRepositoryContract,
} from "./contracts/index";
import { emailFactory, entityIdFactory, membershipFactory } from "./factories/identity";
import { tenantIdFactory } from "./factories/tenant";

const pepper = "a-pepper-long-enough-to-satisfy-the-minimum-length";

describeUserRepositoryContract("InMemoryUserRepository", () => {
  const store = new InMemoryUserStore();
  return {
    registry: new InMemoryUserRepository(store, { kind: "registry" }),
    scopedTo: (tenantId) => new InMemoryUserRepository(store, { kind: "tenant", tenantId }),
  };
});

describeMembershipRepositoryContract("InMemoryMembershipRepository", () => {
  const store = new InMemoryMembershipStore();
  return {
    registry: new InMemoryMembershipRepository(store, { kind: "registry" }),
    scopedTo: (tenantId) => new InMemoryMembershipRepository(store, { kind: "tenant", tenantId }),
  };
});

describeApiKeyRepositoryContract("InMemoryApiKeyRepository", () => {
  const store = new InMemoryApiKeyStore();
  return {
    registry: new InMemoryApiKeyRepository(store, { kind: "registry" }),
    scopedTo: (tenantId) => new InMemoryApiKeyRepository(store, { kind: "tenant", tenantId }),
  };
});

describeApiKeyHasherContract("InMemoryApiKeyHasher", () => new InMemoryApiKeyHasher());
describeApiKeyHasherContract("Sha256ApiKeyHasher", () => new Sha256ApiKeyHasher({ pepper }));

describeSecretGeneratorContract("SequentialSecretGenerator", () => new SequentialSecretGenerator());
describeSecretGeneratorContract("RandomSecretGenerator", () => new RandomSecretGenerator());

describeIdentityProviderContract("InMemoryIdentityProvider", () => {
  const provider = new InMemoryIdentityProvider();
  return {
    provider,
    issueSession: () => {
      const session = { subjectId: entityIdFactory(10), email: emailFactory() };
      return Promise.resolve({ ...session, token: provider.issue(session) });
    },
  };
});

describePermissionsContract("RolePermissions", () => {
  const store = new InMemoryMembershipStore();
  store.put(membershipFactory({ userId: entityIdOf(tenantIdFactory(2)), tenantId: tenantIdFactory(1), role: "owner" }).toSnapshot());
  return new RolePermissions({
    membershipsScopedTo: (tenantId) => new InMemoryMembershipRepository(store, { kind: "tenant", tenantId }),
  });
});

describe("sha256 api key hasher", () => {
  it("refuses a pepper shorter than the minimum", () => {
    expect(() => new Sha256ApiKeyHasher({ pepper: "short" })).toThrow();
  });

  it("marks its hashes with the algorithm", async () => {
    const hash = await new Sha256ApiKeyHasher({ pepper }).hash({ key: "ak_x.y" });
    expect(hash.startsWith(sha256HashMarker)).toBe(true);
  });

  it("binds the hash to the installation pepper", async () => {
    const hash = await new Sha256ApiKeyHasher({ pepper }).hash({ key: "ak_x.y" });
    const other = new Sha256ApiKeyHasher({ pepper: `${pepper}-other` });
    expect(await other.verify({ key: "ak_x.y", hash })).toBe(false);
  });

  it("rejects a stored hash of another length without throwing", async () => {
    const hasher = new Sha256ApiKeyHasher({ pepper });
    expect(await hasher.verify({ key: "ak_x.y", hash: `${sha256HashMarker}abcd` })).toBe(false);
  });
});

describe("in memory identity provider", () => {
  it("stops recognising a revoked token", async () => {
    const provider = new InMemoryIdentityProvider();
    const token = provider.issue({ subjectId: entityIdFactory(10), email: emailFactory() });
    provider.revoke(token);
    expect(isErr(await provider.verifySession({ token }))).toBe(true);
  });
});

type GetUserResponse = Awaited<ReturnType<SupabaseSessionClient["auth"]["getUser"]>>;

function clientAnswering(answer: () => Promise<GetUserResponse>): SupabaseSessionClient {
  return { auth: { getUser: () => answer() } };
}

function userResponse(id: string, email: string | undefined): GetUserResponse {
  const user = {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-15T10:00:00.000Z",
    ...(email === undefined ? {} : { email }),
  };
  return { data: { user }, error: null };
}

function errorResponse(message: string): GetUserResponse {
  return { data: { user: null }, error: new AuthApiError(message, 401, "bad_jwt") };
}

describe("supabase identity provider translation", () => {
  it("maps a verified user to a session", async () => {
    const provider = new SupabaseIdentityProvider({
      client: clientAnswering(() => Promise.resolve(userResponse(entityIdFactory(10), "Karen@Example.com"))),
    });
    const result = await provider.verifySession({ token: "jwt" });
    if (!isOk(result)) throw new Error(`Expected a session, received ${result.error.code}`);
    expect(result.value).toEqual({ subjectId: entityIdFactory(10), email: emailFactory("karen@example.com") });
  });

  it("maps an auth error to a forbidden result", async () => {
    const provider = new SupabaseIdentityProvider({
      client: clientAnswering(() => Promise.resolve(errorResponse("invalid JWT"))),
    });
    const result = await provider.verifySession({ token: "jwt" });
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.code).toBe("identity.session.invalid");
  });

  it("refuses a user without an email", async () => {
    const provider = new SupabaseIdentityProvider({
      client: clientAnswering(() => Promise.resolve(userResponse(entityIdFactory(10), undefined))),
    });
    const result = await provider.verifySession({ token: "jwt" });
    if (!isErr(result)) throw new Error("Expected a failure");
    expect(result.error.code).toBe("identity.session.noEmail");
  });

  it("refuses a subject that is not a uuid", async () => {
    const provider = new SupabaseIdentityProvider({
      client: clientAnswering(() => Promise.resolve(userResponse("not-a-uuid", "karen@example.com"))),
    });
    expect(isErr(await provider.verifySession({ token: "jwt" }))).toBe(true);
  });

  it("never calls the provider with an empty token", async () => {
    let calls = 0;
    const provider = new SupabaseIdentityProvider({
      client: clientAnswering(() => {
        calls += 1;
        return Promise.resolve(userResponse(entityIdFactory(10), "karen@example.com"));
      }),
    });
    await provider.verifySession({ token: "" });
    expect(calls).toBe(0);
  });

  it("throws when the provider does not answer within the timeout", async () => {
    const provider = new SupabaseIdentityProvider({
      client: clientAnswering(() => new Promise(() => undefined)),
      timeoutMilliseconds: 10,
    });
    const caught = await provider.verifySession({ token: "jwt" }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(caught).toBeInstanceOf(Error);
  });
});
