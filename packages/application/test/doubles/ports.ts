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
  AuditEntry,
  AuditEntryInput,
  AuditTrail,
  Clock,
  IdempotencyKey,
  IdempotencyRecord,
  IdempotencyStore,
  IdGenerator,
  JobQueue,
  JobRetry,
  LogFields,
  Logger,
  Mailer,
  MailMessage,
  Outbox,
  PermissionRequest,
  Span,
  SpanAttributes,
  SpanStatus,
  StoredEvent,
  StoredJob,
  Permissions,
  Telemetry,
  TenantRepository,
  TenantScope,
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
  scopes: TenantScope[] = [];

  async run<Value>(scope: TenantScope, work: () => Promise<Value>): Promise<Value> {
    this.runs += 1;
    this.scopes.push(scope);
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

type StoredJobRow = {
  id: string;
  tenantId: StoredJob["tenantId"];
  name: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  priority: StoredJob["priority"];
  runAt: number;
  completed: boolean;
  exhausted: boolean;
};

export class StubJobQueue implements JobQueue {
  readonly #rows: StoredJobRow[] = [];
  readonly completed: string[] = [];
  readonly failed: string[] = [];
  readonly exhausted: string[] = [];

  enqueue(request: {
    tenantId: StoredJob["tenantId"];
    name: string;
    payload: unknown;
    runAt?: Date;
    maxAttempts?: number;
    priority?: StoredJob["priority"];
  }): Promise<void> {
    this.#rows.push({
      id: String(this.#rows.length + 1),
      tenantId: request.tenantId,
      name: request.name,
      payload: request.payload,
      attempts: 0,
      maxAttempts: request.maxAttempts ?? 5,
      priority: request.priority ?? "background",
      runAt: request.runAt?.getTime() ?? 0,
      completed: false,
      exhausted: false,
    });
    return Promise.resolve();
  }

  seed(job: StoredJob, runAt = 0): string {
    this.#rows.push({ ...job, runAt, completed: false, exhausted: false });
    return job.id;
  }

  claimDue(limit: number, now: Date): Promise<readonly StoredJob[]> {
    const due = this.#rows
      .filter((row) => !row.completed && !row.exhausted && row.runAt <= now.getTime())
      .slice(0, limit)
      .map(({ id, tenantId, name, payload, attempts, maxAttempts, priority }) => ({
        id,
        tenantId,
        name,
        payload,
        attempts,
        maxAttempts,
        priority,
      }));
    return Promise.resolve(due);
  }

  markCompleted(ids: readonly string[]): Promise<void> {
    for (const row of this.#rows) {
      if (ids.includes(row.id)) row.completed = true;
    }
    this.completed.push(...ids);
    return Promise.resolve();
  }

  markFailed(retries: readonly JobRetry[]): Promise<void> {
    const byId = new Map(retries.map((retry) => [retry.id, retry.retryAt]));
    for (const row of this.#rows) {
      const retryAt = byId.get(row.id);
      if (retryAt === undefined) continue;
      row.attempts += 1;
      row.runAt = retryAt.getTime();
    }
    this.failed.push(...retries.map((retry) => retry.id));
    return Promise.resolve();
  }

  markExhausted(ids: readonly string[]): Promise<void> {
    for (const row of this.#rows) {
      if (ids.includes(row.id)) row.exhausted = true;
    }
    this.exhausted.push(...ids);
    return Promise.resolve();
  }
}

export class StubTenantStore {
  readonly tenants = new Map<string, Tenant>();
}

export class StubTenantRepository implements TenantRepository {
  readonly #store: StubTenantStore;
  readonly #scope: TenantScope;

  constructor(store: StubTenantStore = new StubTenantStore(), scope: TenantScope = { kind: "registry" }) {
    this.#store = store;
    this.#scope = scope;
  }

  #isVisible(tenant: Tenant): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === tenant.id;
  }

  seed(tenant: Tenant): void {
    this.#store.tenants.set(tenant.id, tenant);
  }

  findById(id: TenantId): Promise<Tenant | undefined> {
    const tenant = this.#store.tenants.get(id);
    return Promise.resolve(tenant && this.#isVisible(tenant) ? tenant : undefined);
  }

  findBySlug(slug: string): Promise<Tenant | undefined> {
    for (const tenant of this.#store.tenants.values()) {
      if (tenant.slug === slug && this.#isVisible(tenant)) return Promise.resolve(tenant);
    }
    return Promise.resolve(undefined);
  }

  save(tenant: Tenant): Promise<void> {
    if (!this.#isVisible(tenant)) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#store.tenants.set(tenant.id, tenant);
    return Promise.resolve();
  }

  get saved(): readonly Tenant[] {
    return [...this.#store.tenants.values()];
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

export type RecordedSpan = {
  readonly name: string;
  readonly attributes: Record<string, string | number | boolean>;
  readonly exceptions: Error[];
  status: SpanStatus;
};

export class StubTelemetry implements Telemetry {
  readonly spans: RecordedSpan[] = [];

  startSpan(name: string, attributes: SpanAttributes = {}): Span {
    const recorded: RecordedSpan = { name, attributes: { ...attributes }, exceptions: [], status: "ok" };
    this.spans.push(recorded);
    return {
      setAttribute: (attributeName, value) => {
        recorded.attributes[attributeName] = value;
      },
      recordException: (error) => {
        recorded.exceptions.push(error);
      },
      end: (status) => {
        if (status !== undefined) recorded.status = status;
      },
    };
  }
}

export class StubAuditTrail implements AuditTrail {
  readonly entries: AuditEntry[] = [];
  #sequence = 0;

  record(entry: AuditEntryInput): Promise<void> {
    this.#sequence += 1;
    this.entries.push({ id: String(this.#sequence), ...entry });
    return Promise.resolve();
  }

  findRecent(limit: number): Promise<readonly AuditEntry[]> {
    return Promise.resolve(
      [...this.entries].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()).slice(0, limit),
    );
  }

  findForResource(resourceType: string, resourceId: string): Promise<readonly AuditEntry[]> {
    return Promise.resolve(this.entries.filter((entry) => entry.resourceType === resourceType && entry.resourceId === resourceId));
  }
}

function slotOf(key: IdempotencyKey): string {
  return `${key.scope} ${key.key}`;
}

export class StubIdempotencyStore implements IdempotencyStore {
  readonly #records = new Map<string, IdempotencyRecord>();
  readonly saved: IdempotencyRecord[] = [];

  find(key: IdempotencyKey): Promise<IdempotencyRecord | undefined> {
    return Promise.resolve(this.#records.get(slotOf(key)));
  }

  save(record: IdempotencyRecord): Promise<void> {
    this.#records.set(slotOf(record), record);
    this.saved.push(record);
    return Promise.resolve();
  }

  get size(): number {
    return this.#records.size;
  }
}
