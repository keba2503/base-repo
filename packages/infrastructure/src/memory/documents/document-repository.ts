import type { DocumentRepository, TenantScope } from "@base/application";
import { Document, isOk, type DocumentSnapshot, type EntityId } from "@base/domain";

export class InMemoryDocumentStore {
  readonly #snapshots = new Map<string, DocumentSnapshot>();

  put(snapshot: DocumentSnapshot): void {
    this.#snapshots.set(snapshot.id, snapshot);
  }

  byId(id: EntityId): DocumentSnapshot | undefined {
    return this.#snapshots.get(id);
  }

  all(): readonly DocumentSnapshot[] {
    return [...this.#snapshots.values()];
  }
}

function hydrate(snapshot: DocumentSnapshot): Document {
  const restored = Document.restore(snapshot);
  if (!isOk(restored)) {
    throw new Error(`A stored document violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class InMemoryDocumentRepository implements DocumentRepository {
  readonly #store: InMemoryDocumentStore;
  readonly #scope: TenantScope;

  constructor(store: InMemoryDocumentStore, scope: TenantScope) {
    this.#store = store;
    this.#scope = scope;
  }

  #isVisible(snapshot: DocumentSnapshot): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === snapshot.tenantId;
  }

  findById(id: EntityId): Promise<Document | undefined> {
    const snapshot = this.#store.byId(id);
    if (!snapshot || !this.#isVisible(snapshot)) return Promise.resolve(undefined);
    return Promise.resolve(hydrate(snapshot));
  }

  list(request: { readonly limit: number }): Promise<readonly Document[]> {
    const visible = this.#store
      .all()
      .filter((snapshot) => this.#isVisible(snapshot))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, request.limit)
      .map(hydrate);
    return Promise.resolve(visible);
  }

  save(document: Document): Promise<void> {
    if (!this.#isVisible(document.toSnapshot())) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#store.put(document.toSnapshot());
    return Promise.resolve();
  }
}
