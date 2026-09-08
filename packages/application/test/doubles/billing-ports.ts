import type { DomainError, EntityId, Payment, Result } from "@base/domain";
import type {
  PaymentGateway,
  PaymentHandoff,
  PaymentRepository,
  ProviderNotification,
  ProviderPaymentEvent,
  StartPaymentInstruction,
} from "../../src/index";

export class StubPaymentRepository implements PaymentRepository {
  readonly #payments: Map<string, Payment>;

  constructor(shared?: Map<string, Payment>) {
    this.#payments = shared ?? new Map<string, Payment>();
  }

  seed(payment: Payment): void {
    this.#payments.set(payment.id, payment);
  }

  findById(id: EntityId): Promise<Payment | undefined> {
    return Promise.resolve(this.#payments.get(id));
  }

  save(payment: Payment): Promise<void> {
    this.#payments.set(payment.id, payment);
    return Promise.resolve();
  }

  get saved(): readonly Payment[] {
    return [...this.#payments.values()];
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
