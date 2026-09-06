import type { ConsentRepository } from "@base/application";
import { Consent, isOk, type ConsentCategory, type ConsentSnapshot, type EntityId, type TenantId } from "@base/domain";

export class InMemoryConsentStore {
  readonly #snapshots = new Map<string, ConsentSnapshot>();

  put(snapshot: ConsentSnapshot): void {
    this.#snapshots.set(snapshot.id, snapshot);
  }

  all(): readonly ConsentSnapshot[] {
    return [...this.#snapshots.values()];
  }
}

function hydrate(snapshot: ConsentSnapshot): Consent {
  const restored = Consent.restore(snapshot);
  if (!isOk(restored)) {
    throw new Error(`A stored consent violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class InMemoryConsentRepository implements ConsentRepository {
  readonly #store: InMemoryConsentStore;
  readonly #tenantId: TenantId;

  constructor(store: InMemoryConsentStore, tenantId: TenantId) {
    this.#store = store;
    this.#tenantId = tenantId;
  }

  #ownSnapshots(): readonly ConsentSnapshot[] {
    return this.#store.all().filter((snapshot) => snapshot.tenantId === this.#tenantId);
  }

  findActive(subjectId: EntityId, category: ConsentCategory): Promise<Consent | undefined> {
    const active = this.#ownSnapshots()
      .filter((snapshot) => snapshot.subjectId === subjectId && snapshot.category === category && snapshot.withdrawnAt === null)
      .sort((left, right) => right.grantedAt.getTime() - left.grantedAt.getTime())[0];
    return Promise.resolve(active ? hydrate(active) : undefined);
  }

  findAllForSubject(subjectId: EntityId): Promise<readonly Consent[]> {
    return Promise.resolve(
      this.#ownSnapshots()
        .filter((snapshot) => snapshot.subjectId === subjectId)
        .map(hydrate),
    );
  }

  save(consent: Consent): Promise<void> {
    if (consent.tenantId !== this.#tenantId) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#store.put(consent.toSnapshot());
    return Promise.resolve();
  }
}
