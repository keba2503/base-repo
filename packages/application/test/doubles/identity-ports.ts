import {
  err,
  forbidden,
  ok,
  type ApiKey,
  type DomainError,
  type Email,
  type EntityId,
  type Membership,
  type Result,
  type TenantId,
  type User,
} from "@base/domain";
import type {
  ApiKeyHasher,
  ApiKeyRepository,
  IdentityProvider,
  MembershipRepository,
  SecretGenerator,
  UserRepository,
  VerifiedSession,
} from "../../src/index";

export class StubIdentityProvider implements IdentityProvider {
  readonly #sessions = new Map<string, VerifiedSession>();

  issue(token: string, session: VerifiedSession): void {
    this.#sessions.set(token, session);
  }

  verifySession(request: { token: string }): Promise<Result<VerifiedSession, DomainError>> {
    const session = this.#sessions.get(request.token);
    if (!session) {
      return Promise.resolve(err(forbidden("identity.session.invalid", "This session is not valid")));
    }
    return Promise.resolve(ok(session));
  }
}

export class StubApiKeyHasher implements ApiKeyHasher {
  hash(request: { key: string }): Promise<string> {
    return Promise.resolve(`hashed:${request.key}`);
  }

  verify(request: { key: string; hash: string }): Promise<boolean> {
    return Promise.resolve(request.hash === `hashed:${request.key}`);
  }
}

export class StubSecretGenerator implements SecretGenerator {
  #issued = 0;

  next(): string {
    this.#issued += 1;
    return `secret-${String(this.#issued)}`;
  }
}

export class StubUserRepository implements UserRepository {
  readonly #users = new Map<string, User>();

  seed(user: User): void {
    this.#users.set(user.id, user);
  }

  findById(id: EntityId): Promise<User | undefined> {
    return Promise.resolve(this.#users.get(id));
  }

  findByEmail(email: Email): Promise<User | undefined> {
    for (const user of this.#users.values()) {
      if (user.email === email) return Promise.resolve(user);
    }
    return Promise.resolve(undefined);
  }

  save(user: User): Promise<void> {
    this.#users.set(user.id, user);
    return Promise.resolve();
  }

  get saved(): readonly User[] {
    return [...this.#users.values()];
  }
}

export class StubMembershipRepository implements MembershipRepository {
  readonly #memberships: Membership[] = [];
  readonly #tenantId: TenantId | undefined;

  constructor(tenantId?: TenantId, shared?: Membership[]) {
    this.#tenantId = tenantId;
    if (shared) this.#memberships = shared;
  }

  scopedTo(tenantId: TenantId): StubMembershipRepository {
    return new StubMembershipRepository(tenantId, this.#memberships);
  }

  seed(membership: Membership): void {
    this.#memberships.push(membership);
  }

  findByUserId(userId: EntityId): Promise<readonly Membership[]> {
    return Promise.resolve(
      this.#memberships.filter(
        (membership) =>
          membership.userId === userId &&
          (this.#tenantId === undefined || membership.tenantId === this.#tenantId),
      ),
    );
  }

  save(membership: Membership): Promise<void> {
    this.#memberships.push(membership);
    return Promise.resolve();
  }

  get saved(): readonly Membership[] {
    return [...this.#memberships];
  }
}

export class StubApiKeyRepository implements ApiKeyRepository {
  readonly #apiKeys: Map<string, ApiKey>;
  readonly #tenantId: TenantId | undefined;
  readonly scopesRequested: TenantId[] = [];

  constructor(tenantId?: TenantId, shared?: Map<string, ApiKey>) {
    this.#tenantId = tenantId;
    this.#apiKeys = shared ?? new Map<string, ApiKey>();
  }

  scopedTo(tenantId: TenantId): StubApiKeyRepository {
    this.scopesRequested.push(tenantId);
    return new StubApiKeyRepository(tenantId, this.#apiKeys);
  }

  seed(apiKey: ApiKey): void {
    this.#apiKeys.set(apiKey.id, apiKey);
  }

  #visible(apiKey: ApiKey | undefined): ApiKey | undefined {
    if (!apiKey) return undefined;
    if (this.#tenantId !== undefined && apiKey.tenantId !== this.#tenantId) return undefined;
    return apiKey;
  }

  findById(id: EntityId): Promise<ApiKey | undefined> {
    return Promise.resolve(this.#visible(this.#apiKeys.get(id)));
  }

  findByPrefix(keyPrefix: string): Promise<ApiKey | undefined> {
    for (const apiKey of this.#apiKeys.values()) {
      if (apiKey.keyPrefix === keyPrefix) return Promise.resolve(this.#visible(apiKey));
    }
    return Promise.resolve(undefined);
  }

  save(apiKey: ApiKey): Promise<void> {
    if (this.#tenantId !== undefined && apiKey.tenantId !== this.#tenantId) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#apiKeys.set(apiKey.id, apiKey);
    return Promise.resolve();
  }

  get saved(): readonly ApiKey[] {
    return [...this.#apiKeys.values()];
  }
}
