import type {
  Clock,
  DocumentProcessor,
  DocumentRepository,
  FieldCipher,
  FileStore,
  IdGenerator,
  JobQueue,
  Logger,
  Mailer,
  Outbox,
  Permissions,
  Telemetry,
  TenantRepository,
  UnitOfWork,
} from "@base/application";
import { documentFieldClassifications, tenantFieldClassifications, type TenantId } from "@base/domain";
import {
  AesGcmFieldCipher,
  ConsoleLogger,
  ConsoleMailer,
  createOtelClient,
  createPostgresClient,
  createResendClient,
  InMemoryDocumentRepository,
  InMemoryDocumentStore,
  InMemoryFieldCipher,
  InMemoryFileStore,
  InMemoryJobQueue,
  InMemoryJobStore,
  InMemoryMailer,
  InMemoryOutbox,
  InMemoryTelemetry,
  InMemoryTenantRepository,
  InMemoryTenantStore,
  InMemoryUnitOfWork,
  NoopTelemetry,
  NullDocumentProcessor,
  OtelTelemetry,
  PostgresDocumentRepository,
  PostgresJobQueue,
  PostgresOutbox,
  PostgresTenantRepository,
  PostgresUnitOfWork,
  RandomIdGenerator,
  redactionPolicyFrom,
  ResendMailer,
  ScopedPermissions,
  sentryOtlpEndpointFrom,
  SilentLogger,
  SupabaseFileStore,
  SystemClock,
  type OtelClient,
  type PostgresClient,
  type RedactionPolicy,
} from "@base/infrastructure";
import { createClient } from "@supabase/supabase-js";
import type { Environment } from "./env";

export type Container = {
  readonly tenantRegistry: TenantRepository;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: Outbox;
  readonly jobQueue: JobQueue;
  documentsScopedTo(tenantId: TenantId): DocumentRepository;
  readonly fileStore: FileStore;
  readonly documentProcessor: DocumentProcessor;
  readonly logger: Logger;
  readonly telemetry: Telemetry;
  readonly mailer: Mailer;
  close(): Promise<void>;
};

const logRedactionPolicy = redactionPolicyFrom(tenantFieldClassifications, documentFieldClassifications);

function memoryPersistence(): Pick<Container, "tenantRegistry" | "unitOfWork" | "outbox" | "jobQueue" | "documentsScopedTo"> {
  const store = new InMemoryTenantStore();
  const jobStore = new InMemoryJobStore();
  const documentStore = new InMemoryDocumentStore();
  return {
    tenantRegistry: new InMemoryTenantRepository(store, { kind: "registry" }),
    unitOfWork: new InMemoryUnitOfWork(),
    outbox: new InMemoryOutbox(),
    jobQueue: new InMemoryJobQueue(jobStore, { kind: "registry" }),
    documentsScopedTo: (tenantId) => new InMemoryDocumentRepository(documentStore, { kind: "tenant", tenantId }),
  };
}

function postgresPersistence(
  client: PostgresClient,
  cipher: FieldCipher,
): Pick<Container, "tenantRegistry" | "unitOfWork" | "outbox" | "jobQueue" | "documentsScopedTo"> {
  return {
    tenantRegistry: new PostgresTenantRepository(client.db, { kind: "registry" }),
    unitOfWork: new PostgresUnitOfWork(client.db),
    outbox: new PostgresOutbox(client.db),
    jobQueue: new PostgresJobQueue(client.db, { kind: "registry" }),
    documentsScopedTo: (tenantId) => new PostgresDocumentRepository(client.db, { kind: "tenant", tenantId }, cipher),
  };
}

function fieldCipherFor(environment: Environment, logger: Logger): FieldCipher {
  if (environment.nodeEnv === "test") return new InMemoryFieldCipher();
  if (environment.fieldEncryptionKeys === undefined) {
    if (!environment.allowEphemeralFieldEncryptionKey) {
      throw new Error(
        "FIELD_ENCRYPTION_KEYS is required to encrypt sensitive fields; set ALLOW_EPHEMERAL_FIELD_ENCRYPTION_KEY=true only for disposable local development, never in a shared or production environment",
      );
    }
    logger.warn(
      "using an ephemeral field encryption key generated at boot: everything encrypted with it becomes permanently unreadable once this process restarts",
    );
    return new AesGcmFieldCipher({
      keys: [{ id: "ephemeral-unsafe-dev-key", key: crypto.getRandomValues(Buffer.alloc(32)) }],
    });
  }
  const keys = environment.fieldEncryptionKeys.split(",").map((entry) => {
    const [id, base64Key] = entry.split(":");
    if (id === undefined || base64Key === undefined) {
      throw new Error("FIELD_ENCRYPTION_KEYS must be a comma separated list of id:base64key pairs");
    }
    return { id, key: Buffer.from(base64Key, "base64") };
  });
  return new AesGcmFieldCipher({ keys });
}

function fileStoreFor(environment: Environment): FileStore {
  if (
    environment.nodeEnv === "test" ||
    environment.supabaseUrl === undefined ||
    environment.supabaseServiceRoleKey === undefined
  ) {
    return new InMemoryFileStore();
  }
  return new SupabaseFileStore({
    client: createClient(environment.supabaseUrl, environment.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    bucket: environment.documentsBucket,
  });
}

function telemetryFor(
  environment: Environment,
  logger: Logger,
  policy: RedactionPolicy,
): { telemetry: Telemetry; otelClient: OtelClient | undefined } {
  if (environment.nodeEnv === "test") return { telemetry: new InMemoryTelemetry({ policy }), otelClient: undefined };
  if (environment.sentryDsn === undefined) {
    logger.warn("SENTRY_DSN is not configured: job spans are not exported anywhere");
    return { telemetry: new NoopTelemetry(), otelClient: undefined };
  }
  const otelClient = createOtelClient({
    serviceName: environment.workerName,
    endpoint: sentryOtlpEndpointFrom(environment.sentryDsn),
  });
  return { telemetry: new OtelTelemetry(otelClient.tracer, { policy }), otelClient };
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
  const logger: Logger =
    environment.nodeEnv === "test" ? new SilentLogger() : new ConsoleLogger({ policy: logRedactionPolicy });
  const fieldCipher = fieldCipherFor(environment, logger);
  const persistence = client !== undefined ? postgresPersistence(client, fieldCipher) : memoryPersistence();
  const { telemetry, otelClient } = telemetryFor(environment, logger, logRedactionPolicy);

  return {
    ...persistence,
    clock: new SystemClock(),
    idGenerator: new RandomIdGenerator(),
    permissions: new ScopedPermissions(),
    fileStore: fileStoreFor(environment),
    documentProcessor: new NullDocumentProcessor(),
    mailer: mailerFor(environment),
    logger,
    telemetry,
    close: async () => {
      await client?.close();
      await otelClient?.shutdown();
    },
  };
}
