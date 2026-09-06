import type { ApiKeyRepository, TenantScope } from "@base/application";
import { ApiKey, isOk, type ApiKeySnapshot, type EntityId } from "@base/domain";

export class InMemoryApiKeyStore {
  readonly #snapshots = new Map<string, ApiKeySnapshot>();

  put(snapshot: ApiKeySnapshot): void {
    this.#snapshots.set(snapshot.id, snapshot);
  }

  byId(id: EntityId): ApiKeySnapshot | undefined {
    return this.#snapshots.get(id);
  }

  byPrefix(keyPrefix: string): ApiKeySnapshot | undefined {
    for (const snapshot of this.#snapshots.values()) {
      if (snapshot.keyPrefix === keyPrefix) return snapshot;
    }
    return undefined;
  }

  get size(): number {
    return this.#snapshots.size;
  }
}

function hydrate(snapshot: ApiKeySnapshot): ApiKey {
  const restored = ApiKey.restore(snapshot);
  if (!isOk(restored)) {
    throw new Error(`A stored api key violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class InMemoryApiKeyRepository implements ApiKeyRepository {
  readonly #store: InMemoryApiKeyStore;
  readonly #scope: TenantScope;

  constructor(store: InMemoryApiKeyStore, scope: TenantScope) {
    this.#store = store;
    this.#scope = scope;
  }

  #isVisible(snapshot: ApiKeySnapshot): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === snapshot.tenantId;
  }

  findById(id: EntityId): Promise<ApiKey | undefined> {
    const snapshot = this.#store.byId(id);
    if (!snapshot || !this.#isVisible(snapshot)) return Promise.resolve(undefined);
    return Promise.resolve(hydrate(snapshot));
  }

  findByPrefix(keyPrefix: string): Promise<ApiKey | undefined> {
    const snapshot = this.#store.byPrefix(keyPrefix);
    if (!snapshot || !this.#isVisible(snapshot)) return Promise.resolve(undefined);
    return Promise.resolve(hydrate(snapshot));
  }

  save(apiKey: ApiKey): Promise<void> {
    if (!this.#isVisible(apiKey.toSnapshot())) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#store.put(apiKey.toSnapshot());
    return Promise.resolve();
  }
}
