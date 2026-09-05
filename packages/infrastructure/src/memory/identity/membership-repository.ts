import type { MembershipRepository, TenantScope } from "@base/application";
import { isOk, Membership, type EntityId, type MembershipSnapshot } from "@base/domain";

function keyOf(snapshot: Pick<MembershipSnapshot, "userId" | "tenantId">): string {
  return `${snapshot.userId}:${snapshot.tenantId}`;
}

export class InMemoryMembershipStore {
  readonly #snapshots = new Map<string, MembershipSnapshot>();

  put(snapshot: MembershipSnapshot): void {
    this.#snapshots.set(keyOf(snapshot), snapshot);
  }

  byUserId(userId: EntityId): readonly MembershipSnapshot[] {
    return [...this.#snapshots.values()].filter((snapshot) => snapshot.userId === userId);
  }

  get size(): number {
    return this.#snapshots.size;
  }
}

function hydrate(snapshot: MembershipSnapshot): Membership {
  const restored = Membership.restore(snapshot);
  if (!isOk(restored)) {
    throw new Error(`A stored membership violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class InMemoryMembershipRepository implements MembershipRepository {
  readonly #store: InMemoryMembershipStore;
  readonly #scope: TenantScope;

  constructor(store: InMemoryMembershipStore, scope: TenantScope) {
    this.#store = store;
    this.#scope = scope;
  }

  #isVisible(snapshot: MembershipSnapshot): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === snapshot.tenantId;
  }

  findByUserId(userId: EntityId): Promise<readonly Membership[]> {
    const visible = this.#store.byUserId(userId).filter((snapshot) => this.#isVisible(snapshot));
    return Promise.resolve(visible.map(hydrate));
  }

  save(membership: Membership): Promise<void> {
    if (!this.#isVisible(membership.toSnapshot())) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#store.put(membership.toSnapshot());
    return Promise.resolve();
  }
}
