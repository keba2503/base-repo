import { isOk, parseEntityId, type DomainEvent, type EntityId, type Tenant, type TenantId } from "@base/domain";
import type {
  Clock,
  IdGenerator,
  Outbox,
  PermissionRequest,
  StoredEvent,
  Permissions,
  TenantRepository,
  UnitOfWork,
} from "../../src/index";

export class StubClock implements Clock {
  readonly #instant: Date;

  constructor(instant: Date) {
    this.#instant = instant;
  }

  now(): Date {
    return new Date(this.#instant.getTime());
  }
}

export class StubIdGenerator implements IdGenerator {
  #issued = 0;

  next(): EntityId {
    this.#issued += 1;
    const parsed = parseEntityId(
      `00000000-0000-4000-8000-${this.#issued.toString(16).padStart(12, "0")}`,
    );
    if (!isOk(parsed)) throw new Error("The stub generator produced an invalid identifier");
    return parsed.value;
  }
}

export class StubPermissions implements Permissions {
  readonly #granted: ReadonlySet<string>;
  readonly requests: PermissionRequest[] = [];

  constructor(granted: readonly string[]) {
    this.#granted = new Set(granted);
  }

  can(request: PermissionRequest): Promise<boolean> {
    this.requests.push(request);
    return Promise.resolve(this.#granted.has(request.action));
  }
}

export class StubUnitOfWork implements UnitOfWork {
  runs = 0;

  async run<Value>(work: () => Promise<Value>): Promise<Value> {
    this.runs += 1;
    return await work();
  }
}

export class StubOutbox implements Outbox {
  readonly events: DomainEvent[] = [];

  enqueue(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }

  pullUnpublished(limit: number): Promise<readonly StoredEvent[]> {
    return Promise.resolve(
      this.events.slice(0, limit).map((event, index) => ({ id: String(index + 1), event, attempts: 0 })),
    );
  }

  markPublished(): Promise<void> {
    return Promise.resolve();
  }

  markFailed(): Promise<void> {
    return Promise.resolve();
  }
}

export class StubTenantRepository implements TenantRepository {
  readonly #tenants = new Map<string, Tenant>();

  seed(tenant: Tenant): void {
    this.#tenants.set(tenant.id, tenant);
  }

  findById(id: TenantId): Promise<Tenant | undefined> {
    return Promise.resolve(this.#tenants.get(id));
  }

  findBySlug(slug: string): Promise<Tenant | undefined> {
    for (const tenant of this.#tenants.values()) {
      if (tenant.slug === slug) return Promise.resolve(tenant);
    }
    return Promise.resolve(undefined);
  }

  save(tenant: Tenant): Promise<void> {
    this.#tenants.set(tenant.id, tenant);
    return Promise.resolve();
  }

  get saved(): readonly Tenant[] {
    return [...this.#tenants.values()];
  }
}
