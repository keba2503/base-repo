import type { PaymentRepository, TenantScope } from "@base/application";
import { Payment, isOk, type EntityId, type PaymentSnapshot } from "@base/domain";

export class InMemoryPaymentStore {
  readonly #snapshots = new Map<string, PaymentSnapshot>();

  put(snapshot: PaymentSnapshot): void {
    this.#snapshots.set(snapshot.id, snapshot);
  }

  byId(id: EntityId): PaymentSnapshot | undefined {
    return this.#snapshots.get(id);
  }

  all(): readonly PaymentSnapshot[] {
    return [...this.#snapshots.values()];
  }
}

function hydrate(snapshot: PaymentSnapshot): Payment {
  const restored = Payment.restore(snapshot);
  if (!isOk(restored)) {
    throw new Error(`A stored payment violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class InMemoryPaymentRepository implements PaymentRepository {
  readonly #store: InMemoryPaymentStore;
  readonly #scope: TenantScope;

  constructor(store: InMemoryPaymentStore, scope: TenantScope) {
    this.#store = store;
    this.#scope = scope;
  }

  #isVisible(snapshot: PaymentSnapshot): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === snapshot.tenantId;
  }

  findById(id: EntityId): Promise<Payment | undefined> {
    const snapshot = this.#store.byId(id);
    if (!snapshot || !this.#isVisible(snapshot)) return Promise.resolve(undefined);
    return Promise.resolve(hydrate(snapshot));
  }

  save(payment: Payment): Promise<void> {
    if (!this.#isVisible(payment.toSnapshot())) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#store.put(payment.toSnapshot());
    return Promise.resolve();
  }
}
