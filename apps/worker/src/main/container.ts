import type { Clock, IdGenerator, Logger, Outbox, TenantRepository, UnitOfWork } from "@base/application";
import {
  ConsoleLogger,
  InMemoryOutbox,
  InMemoryTenantRepository,
  InMemoryTenantStore,
  InMemoryUnitOfWork,
  RandomIdGenerator,
  SilentLogger,
  SystemClock,
} from "@base/infrastructure";
import type { Environment } from "./env";

export type Container = {
  readonly tenantRegistry: TenantRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: Outbox;
  readonly logger: Logger;
};

const tenantRedactionPolicy = { name: "personal" } as const;

export function createContainer(environment: Environment): Container {
  const store = new InMemoryTenantStore();

  return {
    tenantRegistry: new InMemoryTenantRepository(store, { kind: "registry" }),
    clock: new SystemClock(),
    idGenerator: new RandomIdGenerator(),
    unitOfWork: new InMemoryUnitOfWork(),
    outbox: new InMemoryOutbox(),
    logger:
      environment.nodeEnv === "test"
        ? new SilentLogger()
        : new ConsoleLogger({ policy: tenantRedactionPolicy }),
  };
}
