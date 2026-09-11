import type { TenantScope, UserRepository } from "@base/application";
import { isOk, User, type Email, type EntityId, type UserSnapshot } from "@base/domain";

export class InMemoryUserStore {
  readonly #snapshots = new Map<string, UserSnapshot>();

  put(snapshot: UserSnapshot): void {
    this.#snapshots.set(snapshot.id, snapshot);
  }

  byId(id: EntityId): UserSnapshot | undefined {
    return this.#snapshots.get(id);
  }

  byEmail(email: Email): UserSnapshot | undefined {
    for (const snapshot of this.#snapshots.values()) {
      if (snapshot.email === email) return snapshot;
    }
    return undefined;
  }

  values(): IterableIterator<UserSnapshot> {
    return this.#snapshots.values();
  }

  get size(): number {
    return this.#snapshots.size;
  }
}

function hydrate(snapshot: UserSnapshot): User {
  const restored = User.restore(snapshot);
  if (!isOk(restored)) {
    throw new Error(`A stored user violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class InMemoryUserRepository implements UserRepository {
  readonly #store: InMemoryUserStore;
  readonly #scope: TenantScope;

  constructor(store: InMemoryUserStore, scope: TenantScope) {
    this.#store = store;
    this.#scope = scope;
  }

  #isVisible(snapshot: UserSnapshot): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === snapshot.tenantId;
  }

  findById(id: EntityId): Promise<User | undefined> {
    const snapshot = this.#store.byId(id);
    if (!snapshot || !this.#isVisible(snapshot)) return Promise.resolve(undefined);
    return Promise.resolve(hydrate(snapshot));
  }

  findByEmail(email: Email): Promise<User | undefined> {
    const snapshot = this.#store.byEmail(email);
    if (!snapshot || !this.#isVisible(snapshot)) return Promise.resolve(undefined);
    return Promise.resolve(hydrate(snapshot));
  }

  save(user: User): Promise<void> {
    if (!this.#isVisible(user.toSnapshot())) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#store.put(user.toSnapshot());
    return Promise.resolve();
  }
}
