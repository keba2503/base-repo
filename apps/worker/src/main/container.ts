import type { Clock, IdGenerator, Logger, Mailer, Outbox, Permissions, TenantRepository, UnitOfWork } from "@base/application";
import {
  ConsoleLogger,
  ConsoleMailer,
  createPostgresClient,
  createResendClient,
  InMemoryMailer,
  InMemoryOutbox,
  InMemoryTenantRepository,
  InMemoryTenantStore,
  InMemoryUnitOfWork,
  PostgresOutbox,
  PostgresTenantRepository,
  PostgresUnitOfWork,
  RandomIdGenerator,
  ResendMailer,
  ScopedPermissions,
  SilentLogger,
  SystemClock,
  type PostgresClient,
} from "@base/infrastructure";
import type { Environment } from "./env";

export type Container = {
  readonly tenantRegistry: TenantRepository;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: Outbox;
  readonly logger: Logger;
  readonly mailer: Mailer;
  close(): Promise<void>;
};

const tenantRedactionPolicy = { name: "personal" } as const;

function memoryPersistence(): Pick<Container, "tenantRegistry" | "unitOfWork" | "outbox"> {
  const store = new InMemoryTenantStore();
  return {
    tenantRegistry: new InMemoryTenantRepository(store, { kind: "registry" }),
    unitOfWork: new InMemoryUnitOfWork(),
    outbox: new InMemoryOutbox(),
  };
}

function postgresPersistence(client: PostgresClient): Pick<Container, "tenantRegistry" | "unitOfWork" | "outbox"> {
  return {
    tenantRegistry: new PostgresTenantRepository(client.db, { kind: "registry" }),
    unitOfWork: new PostgresUnitOfWork(client.db),
    outbox: new PostgresOutbox(client.db),
  };
}

function mailerFor(environment: Environment): Mailer {
  if (environment.nodeEnv === "test") return new InMemoryMailer();
  if (environment.nodeEnv === "development") return new ConsoleMailer();
  if (environment.resendApiKey === undefined) throw new Error("RESEND_API_KEY is required in production");
  return new ResendMailer({
    client: createResendClient({ apiKey: environment.resendApiKey }),
    from: environment.mailFrom,
    timeoutMs: environment.resendTimeoutMs,
  });
}

export function createContainer(environment: Environment): Container {
  const client =
    environment.nodeEnv !== "test" && environment.databaseUrl !== undefined
      ? createPostgresClient({ connectionString: environment.databaseUrl })
      : undefined;
  const persistence = client !== undefined ? postgresPersistence(client) : memoryPersistence();

  return {
    ...persistence,
    clock: new SystemClock(),
    idGenerator: new RandomIdGenerator(),
    permissions: new ScopedPermissions(),
    mailer: mailerFor(environment),
    logger:
      environment.nodeEnv === "test"
        ? new SilentLogger()
        : new ConsoleLogger({ policy: tenantRedactionPolicy }),
    close: () => client?.close() ?? Promise.resolve(),
  };
}
