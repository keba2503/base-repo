import type { AnonymizableSource, RetainableSource, SubjectDataSource } from "@base/application";
import { isOk, User, type EntityId, type TenantId, type UserSnapshot } from "@base/domain";

const anonymizedEmailDomain = "erased.invalid";

export class InMemoryPrivacyUserStore {
  readonly #snapshots = new Map<string, UserSnapshot>();

  put(snapshot: UserSnapshot): void {
    this.#snapshots.set(snapshot.id, snapshot);
  }

  get(id: string): UserSnapshot | undefined {
    return this.#snapshots.get(id);
  }

  values(): IterableIterator<UserSnapshot> {
    return this.#snapshots.values();
  }
}

function hydrate(snapshot: UserSnapshot): User {
  const restored = User.restore(snapshot);
  if (!isOk(restored)) throw new Error(`A stored user violates its invariants: ${restored.error.code}`);
  return restored.value;
}

export class MemoryUserAnonymizableSource implements AnonymizableSource {
  readonly sourceName = "users";
  readonly #store: InMemoryPrivacyUserStore;

  constructor(store: InMemoryPrivacyUserStore) {
    this.#store = store;
  }

  anonymize(tenantId: TenantId, subjectId: EntityId, token: string, at: Date): Promise<boolean> {
    const snapshot = this.#store.get(subjectId);
    if (snapshot?.tenantId !== tenantId) return Promise.resolve(false);
    const user = hydrate(snapshot);
    const anonymized = user.anonymize({ at, token });
    if (!isOk(anonymized)) return Promise.resolve(false);
    this.#store.put(user.toSnapshot());
    return Promise.resolve(true);
  }
}

export class MemoryUserSubjectDataSource implements SubjectDataSource {
  readonly sourceName = "users";
  readonly classifications: SubjectDataSource["classifications"];
  readonly #store: InMemoryPrivacyUserStore;

  constructor(store: InMemoryPrivacyUserStore, classifications: SubjectDataSource["classifications"]) {
    this.#store = store;
    this.classifications = classifications;
  }

  findAllForSubject(tenantId: TenantId, subjectId: EntityId): Promise<readonly Readonly<Record<string, unknown>>[]> {
    const snapshot = this.#store.get(subjectId);
    if (snapshot?.tenantId !== tenantId) return Promise.resolve([]);
    return Promise.resolve([{ email: snapshot.email, displayName: snapshot.displayName }]);
  }
}

export class MemoryUserRetainableSource extends MemoryUserAnonymizableSource implements RetainableSource {
  readonly #store: InMemoryPrivacyUserStore;

  constructor(store: InMemoryPrivacyUserStore) {
    super(store);
    this.#store = store;
  }

  findSubjectsOlderThan(tenantId: TenantId, cutoff: Date): Promise<readonly EntityId[]> {
    const expired: EntityId[] = [];
    for (const snapshot of this.#store.values()) {
      if (snapshot.tenantId !== tenantId || snapshot.createdAt >= cutoff) continue;
      if (snapshot.email.endsWith(`@${anonymizedEmailDomain}`)) continue;
      expired.push(snapshot.id);
    }
    return Promise.resolve(expired);
  }
}
