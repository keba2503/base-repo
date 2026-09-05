import type {
  Clock,
  IdGenerator,
  Logger,
  Outbox,
  Permissions,
  TenantRepository,
  UnitOfWork,
} from "@base/application";
import type { TenantId } from "@base/domain";
import {
  ConsoleLogger,
  FixedClock,
  InMemoryOutbox,
  InMemoryTenantRepository,
  InMemoryTenantStore,
  InMemoryUnitOfWork,
  RandomIdGenerator,
  ScopedPermissions,
  SequentialIdGenerator,
  SilentLogger,
  SystemClock,
} from "@base/infrastructure";
import type { Environment } from "./env";

export type Container = {
  readonly tenantRegistry: TenantRepository;
  tenantsScopedTo(tenantId: TenantId): TenantRepository;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: Outbox;
  readonly logger: Logger;
};

const tenantRedactionPolicy = { name: "personal" } as const;

function deterministicParts(): Pick<Container, "clock" | "idGenerator" | "logger"> {
  return {
    clock: new FixedClock(new Date("2026-01-01T00:00:00.000Z")),
    idGenerator: new SequentialIdGenerator(),
    logger: new SilentLogger(),
  };
}

function liveParts(): Pick<Container, "clock" | "idGenerator" | "logger"> {
  return {
    clock: new SystemClock(),
    idGenerator: new RandomIdGenerator(),
    logger: new ConsoleLogger({ policy: tenantRedactionPolicy }),
  };
}

export function createContainer(environment: Environment): Container {
  const store = new InMemoryTenantStore();
  const parts = environment.nodeEnv === "test" ? deterministicParts() : liveParts();

  return {
    tenantRegistry: new InMemoryTenantRepository(store, { kind: "registry" }),
    tenantsScopedTo: (tenantId) => new InMemoryTenantRepository(store, { kind: "tenant", tenantId }),
    permissions: new ScopedPermissions(),
    unitOfWork: new InMemoryUnitOfWork(),
    outbox: new InMemoryOutbox(),
    ...parts,
  };
}
