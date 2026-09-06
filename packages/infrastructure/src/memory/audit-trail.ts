import type { AuditEntry, AuditEntryInput, AuditTrail } from "@base/application";
import type { TenantId } from "@base/domain";

export class InMemoryAuditStore {
  readonly #entries: AuditEntry[] = [];
  #sequence = 0;

  put(entry: AuditEntryInput): AuditEntry {
    this.#sequence += 1;
    const stored: AuditEntry = { id: String(this.#sequence), ...entry };
    this.#entries.push(stored);
    return stored;
  }

  all(): readonly AuditEntry[] {
    return this.#entries;
  }
}

export class InMemoryAuditTrail implements AuditTrail {
  readonly #store: InMemoryAuditStore;
  readonly #tenantId: TenantId;

  constructor(store: InMemoryAuditStore, tenantId: TenantId) {
    this.#store = store;
    this.#tenantId = tenantId;
  }

  #ownEntries(): readonly AuditEntry[] {
    return this.#store.all().filter((entry) => entry.tenantId === this.#tenantId);
  }

  record(entry: AuditEntryInput): Promise<void> {
    if (entry.tenantId !== this.#tenantId) {
      throw new Error("A tenant scoped audit trail may not record outside its own tenant");
    }
    this.#store.put(entry);
    return Promise.resolve();
  }

  findRecent(limit: number): Promise<readonly AuditEntry[]> {
    return Promise.resolve(
      [...this.#ownEntries()].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()).slice(0, limit),
    );
  }

  findForResource(resourceType: string, resourceId: string): Promise<readonly AuditEntry[]> {
    return Promise.resolve(
      this.#ownEntries().filter((entry) => entry.resourceType === resourceType && entry.resourceId === resourceId),
    );
  }
}
