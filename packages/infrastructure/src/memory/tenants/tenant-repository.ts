import type { TenantRepository, TenantScope } from "@base/application";
import { isOk, Tenant, type TenantId, type TenantSnapshot } from "@base/domain";

export class InMemoryTenantStore {
  readonly #snapshots = new Map<string, TenantSnapshot>();

  put(snapshot: TenantSnapshot): void {
    this.#snapshots.set(snapshot.id, snapshot);
  }

  byId(id: TenantId): TenantSnapshot | undefined {
    return this.#snapshots.get(id);
  }

  bySlug(slug: string): TenantSnapshot | undefined {
    for (const snapshot of this.#snapshots.values()) {
      if (snapshot.slug === slug) return snapshot;
    }
    return undefined;
  }

  get size(): number {
    return this.#snapshots.size;
  }
}

function hydrate(snapshot: TenantSnapshot): Tenant {
  const restored = Tenant.restore(snapshot);
  if (!isOk(restored)) {
    throw new Error(`A stored tenant violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class InMemoryTenantRepository implements TenantRepository {
  readonly #store: InMemoryTenantStore;
  readonly #scope: TenantScope;

  constructor(store: InMemoryTenantStore, scope: TenantScope) {
    this.#store = store;
    this.#scope = scope;
  }

  #isVisible(snapshot: TenantSnapshot): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === snapshot.id;
  }

  findById(id: TenantId): Promise<Tenant | undefined> {
    const snapshot = this.#store.byId(id);
    if (!snapshot || !this.#isVisible(snapshot)) return Promise.resolve(undefined);
    return Promise.resolve(hydrate(snapshot));
  }

  findBySlug(slug: string): Promise<Tenant | undefined> {
    const snapshot = this.#store.bySlug(slug);
    if (!snapshot || !this.#isVisible(snapshot)) return Promise.resolve(undefined);
    return Promise.resolve(hydrate(snapshot));
  }

  save(tenant: Tenant): Promise<void> {
    if (!this.#isVisible(tenant.toSnapshot())) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#store.put(tenant.toSnapshot());
    return Promise.resolve();
  }
}
