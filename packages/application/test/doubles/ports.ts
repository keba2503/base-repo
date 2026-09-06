import {
  err,
  isOk,
  ok,
  parseEntityId,
  unavailable,
  type DomainError,
  type DomainEvent,
  type EntityId,
  type Result,
  type Tenant,
  type TenantId,
} from "@base/domain";
import type {
  Clock,
  IdGenerator,
  LogFields,
  Logger,
  Mailer,
  MailMessage,
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

type StoredRow = { readonly id: string; readonly event: DomainEvent; attempts: number; isPublished: boolean };

export class StubOutbox implements Outbox {
  readonly #rows: StoredRow[] = [];
  readonly published: string[] = [];
  readonly failed: string[] = [];

  enqueue(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      this.#rows.push({ id: String(this.#rows.length + 1), event, attempts: 0, isPublished: false });
    }
    return Promise.resolve();
  }

  seed(event: DomainEvent, attempts = 0): string {
    const id = String(this.#rows.length + 1);
    this.#rows.push({ id, event, attempts, isPublished: false });
    return id;
  }

  pullUnpublished(limit: number): Promise<readonly StoredEvent[]> {
    return Promise.resolve(
      this.#rows
        .filter((row) => !row.isPublished)
        .slice(0, limit)
        .map(({ id, event, attempts }) => ({ id, event, attempts })),
    );
  }

  markPublished(ids: readonly string[]): Promise<void> {
    for (const row of this.#rows) {
      if (ids.includes(row.id)) row.isPublished = true;
    }
    this.published.push(...ids);
    return Promise.resolve();
  }

  markFailed(ids: readonly string[]): Promise<void> {
    for (const row of this.#rows) {
      if (ids.includes(row.id)) row.attempts += 1;
    }
    this.failed.push(...ids);
    return Promise.resolve();
  }

  get events(): readonly DomainEvent[] {
    return this.#rows.map((row) => row.event);
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

export class StubMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  #failure: DomainError | undefined;

  failWith(failure: DomainError): void {
    this.#failure = failure;
  }

  send(message: MailMessage): Promise<Result<void, DomainError>> {
    if (this.#failure) return Promise.resolve(err(this.#failure));
    this.sent.push(message);
    return Promise.resolve(ok(undefined));
  }
}

export function providerOutage(): DomainError {
  return unavailable("mail.provider.unavailable", "The mail provider timed out");
}

export type LogLine = { readonly level: "info" | "warn" | "error"; readonly message: string; readonly fields: LogFields };

export class StubLogger implements Logger {
  readonly lines: LogLine[] = [];

  info(message: string, fields: LogFields = {}): void {
    this.lines.push({ level: "info", message, fields });
  }

  warn(message: string, fields: LogFields = {}): void {
    this.lines.push({ level: "warn", message, fields });
  }

  error(message: string, fields: LogFields = {}): void {
    this.lines.push({ level: "error", message, fields });
  }

  messagesAt(level: LogLine["level"]): readonly string[] {
    return this.lines.filter((line) => line.level === level).map((line) => line.message);
  }
}
