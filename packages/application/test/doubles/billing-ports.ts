import type { DomainError, EntityId, Payment, Result, TenantId } from "@base/domain";
import type {
  PaymentGateway,
  PaymentHandoff,
  PaymentRepository,
  ProviderNotification,
  ProviderPaymentEvent,
  StartPaymentInstruction,
} from "../../src/index";

export type StubPaymentRepositoryScope = { readonly kind: "registry" } | { readonly kind: "tenant"; readonly tenantId: TenantId };

export type StubPaymentRepositoryCall = {
  readonly method: "findById" | "findByIdForWrite" | "save";
  readonly scope: StubPaymentRepositoryScope;
  readonly id: string;
};

export class StubPaymentRepository implements PaymentRepository {
  readonly #payments: Map<string, Payment>;
  readonly #lockedReadOverrides: Map<string, Payment | undefined>;
  readonly #scope: StubPaymentRepositoryScope;
  readonly #calls: StubPaymentRepositoryCall[];

  constructor(
    shared?: Map<string, Payment>,
    scope: StubPaymentRepositoryScope = { kind: "registry" },
    lockedReadOverrides?: Map<string, Payment | undefined>,
    calls?: StubPaymentRepositoryCall[],
  ) {
    this.#payments = shared ?? new Map<string, Payment>();
    this.#lockedReadOverrides = lockedReadOverrides ?? new Map<string, Payment | undefined>();
    this.#scope = scope;
    this.#calls = calls ?? [];
  }

  scopedTo(tenantId: TenantId): StubPaymentRepository {
    return new StubPaymentRepository(this.#payments, { kind: "tenant", tenantId }, this.#lockedReadOverrides, this.#calls);
  }

  #isVisible(tenantId: string): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === tenantId;
  }

  seed(payment: Payment): void {
    this.#payments.set(payment.id, payment);
  }

  seedLockedRead(id: EntityId, payment: Payment | undefined): void {
    this.#lockedReadOverrides.set(id, payment);
  }

  findById(id: EntityId): Promise<Payment | undefined> {
    this.#calls.push({ method: "findById", scope: this.#scope, id });
    const found = this.#payments.get(id);
    return Promise.resolve(found && this.#isVisible(found.tenantId) ? found : undefined);
  }

  findByIdForWrite(id: EntityId): Promise<Payment | undefined> {
    this.#calls.push({ method: "findByIdForWrite", scope: this.#scope, id });
    const found = this.#lockedReadOverrides.has(id) ? this.#lockedReadOverrides.get(id) : this.#payments.get(id);
    return Promise.resolve(found && this.#isVisible(found.tenantId) ? found : undefined);
  }

  save(payment: Payment): Promise<void> {
    this.#calls.push({ method: "save", scope: this.#scope, id: payment.id });
    if (!this.#isVisible(payment.tenantId)) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#payments.set(payment.id, payment);
    return Promise.resolve();
  }

  get saved(): readonly Payment[] {
    return [...this.#payments.values()];
  }

  get calls(): readonly StubPaymentRepositoryCall[] {
    return this.#calls;
  }
}

export class StubPaymentGateway implements PaymentGateway {
  readonly startRequests: StartPaymentInstruction[] = [];
  readonly interpretRequests: ProviderNotification[] = [];
  #startResult: Result<PaymentHandoff, DomainError>;
  #interpretResult: Result<ProviderPaymentEvent, DomainError>;

  constructor(
    startResult: Result<PaymentHandoff, DomainError>,
    interpretResult: Result<ProviderPaymentEvent, DomainError>,
  ) {
    this.#startResult = startResult;
    this.#interpretResult = interpretResult;
  }

  resolveStartWith(result: Result<PaymentHandoff, DomainError>): void {
    this.#startResult = result;
  }

  resolveInterpretWith(result: Result<ProviderPaymentEvent, DomainError>): void {
    this.#interpretResult = result;
  }

  start(instruction: StartPaymentInstruction): Promise<Result<PaymentHandoff, DomainError>> {
    this.startRequests.push(instruction);
    return Promise.resolve(this.#startResult);
  }

  interpret(notification: ProviderNotification): Promise<Result<ProviderPaymentEvent, DomainError>> {
    this.interpretRequests.push(notification);
    return Promise.resolve(this.#interpretResult);
  }
}
