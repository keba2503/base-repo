import type {
  Analytics,
  ApiKeyHasher,
  ApiKeyRepository,
  AuditTrail,
  Clock,
  ConsentRepository,
  DocumentProcessor,
  DocumentRepository,
  FieldCipher,
  FileStore,
  HumanVerifier,
  IdempotencyStore,
  IdGenerator,
  IdentityProvider,
  JobQueue,
  Logger,
  Mailer,
  MembershipRepository,
  Outbox,
  Permissions,
  RateLimiter,
  SecretGenerator,
  Telemetry,
  TenantRepository,
  UnitOfWork,
  UserRepository,
} from "@base/application";
import { RolePermissions } from "@base/application";
import {
  apiKeyFieldClassifications,
  consentFieldClassifications,
  documentFieldClassifications,
  membershipFieldClassifications,
  tenantFieldClassifications,
  userFieldClassifications,
  type TenantId,
} from "@base/domain";
import {
  AesGcmFieldCipher,
  ConsoleLogger,
  ConsoleMailer,
  createPostgresClient,
  createResendClient,
  createTurnstileClient,
  FixedClock,
  InMemoryAnalytics,
  InMemoryApiKeyHasher,
  InMemoryApiKeyRepository,
  InMemoryApiKeyStore,
  InMemoryAuditStore,
  InMemoryAuditTrail,
  InMemoryConsentRepository,
  InMemoryConsentStore,
  InMemoryDocumentRepository,
  InMemoryDocumentStore,
  InMemoryFieldCipher,
  InMemoryFileStore,
  InMemoryHumanVerifier,
  InMemoryIdempotencyStore,
  InMemoryIdentityProvider,
  InMemoryJobQueue,
  InMemoryJobStore,
  InMemoryMailer,
  InMemoryMembershipRepository,
  InMemoryMembershipStore,
  InMemoryOutbox,
  InMemoryTelemetry,
  InMemoryTenantRepository,
  InMemoryTenantStore,
  InMemoryUnitOfWork,
  InMemoryUserRepository,
  InMemoryUserStore,
  MeasurementProtocolAnalytics,
  NoopAnalytics,
  NoopTelemetry,
  NullDocumentProcessor,
  OtelTelemetry,
  PostgresApiKeyRepository,
  PostgresAuditTrail,
  PostgresConsentRepository,
  PostgresDocumentRepository,
  PostgresJobQueue,
  PostgresMembershipRepository,
  PostgresOutbox,
  PostgresTenantRepository,
  PostgresUnitOfWork,
  PostgresUserRepository,
  RandomIdGenerator,
  RandomSecretGenerator,
  redactionPolicyFrom,
  ResendMailer,
  createOtelClient,
  sentryOtlpEndpointFrom,
  SequentialIdGenerator,
  SequentialSecretGenerator,
  Sha256ApiKeyHasher,
  SilentLogger,
  SlidingWindowRateLimiter,
  SupabaseFileStore,
  SupabaseIdentityProvider,
  SystemClock,
  TurnstileHumanVerifier,
  type OtelClient,
  type PostgresClient,
  type RedactionPolicy,
} from "@base/infrastructure";
import { createClient } from "@supabase/supabase-js";
import { isModuleActive } from "../../../../architecture/modules";
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
  readonly telemetry: Telemetry;
  readonly userRegistry: UserRepository;
  readonly membershipRegistry: MembershipRepository;
  membershipsScopedTo(tenantId: TenantId): MembershipRepository;
  readonly apiKeyRegistry: ApiKeyRepository;
  apiKeysScopedTo(tenantId: TenantId): ApiKeyRepository;
  readonly documentRegistry: DocumentRepository;
  documentsScopedTo(tenantId: TenantId): DocumentRepository;
  jobsScopedTo(tenantId: TenantId): JobQueue;
  consentsScopedTo(tenantId: TenantId): ConsentRepository;
  auditScopedTo(tenantId: TenantId): AuditTrail;
  readonly fileStore: FileStore;
  readonly documentProcessor: DocumentProcessor;
  readonly identityProvider: IdentityProvider;
  readonly apiKeyHasher: ApiKeyHasher;
  readonly secretGenerator: SecretGenerator;
  readonly humanVerifier: HumanVerifier;
  readonly idempotencyStore: IdempotencyStore;
  readonly rateLimiter: RateLimiter;
  readonly mailer: Mailer;
  readonly analytics: Analytics;
  close(): Promise<void>;
};

const logRedactionPolicy = redactionPolicyFrom(
  tenantFieldClassifications,
  userFieldClassifications,
  apiKeyFieldClassifications,
  membershipFieldClassifications,
  documentFieldClassifications,
  consentFieldClassifications,
);

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
    logger: new ConsoleLogger({ policy: logRedactionPolicy }),
  };
}

function memoryPersistence(): Pick<Container, "tenantRegistry" | "tenantsScopedTo" | "unitOfWork" | "outbox"> {
  const store = new InMemoryTenantStore();
  return {
    tenantRegistry: new InMemoryTenantRepository(store, { kind: "registry" }),
    tenantsScopedTo: (tenantId) => new InMemoryTenantRepository(store, { kind: "tenant", tenantId }),
    unitOfWork: new InMemoryUnitOfWork(),
    outbox: new InMemoryOutbox(),
  };
}

function postgresPersistence(
  client: PostgresClient,
): Pick<Container, "tenantRegistry" | "tenantsScopedTo" | "unitOfWork" | "outbox"> {
  return {
    tenantRegistry: new PostgresTenantRepository(client.db, { kind: "registry" }),
    tenantsScopedTo: (tenantId) => new PostgresTenantRepository(client.db, { kind: "tenant", tenantId }),
    unitOfWork: new PostgresUnitOfWork(client.db),
    outbox: new PostgresOutbox(client.db),
  };
}

type DocumentsPersistence = Pick<
  Container,
  "documentRegistry" | "documentsScopedTo" | "jobsScopedTo" | "consentsScopedTo" | "auditScopedTo"
>;

function memoryDocumentsPersistence(): DocumentsPersistence {
  const documents = new InMemoryDocumentStore();
  const jobs = new InMemoryJobStore();
  const consents = new InMemoryConsentStore();
  const audit = new InMemoryAuditStore();
  return {
    documentRegistry: new InMemoryDocumentRepository(documents, { kind: "registry" }),
    documentsScopedTo: (tenantId) => new InMemoryDocumentRepository(documents, { kind: "tenant", tenantId }),
    jobsScopedTo: (tenantId) => new InMemoryJobQueue(jobs, { kind: "tenant", tenantId }),
    consentsScopedTo: (tenantId) => new InMemoryConsentRepository(consents, tenantId),
    auditScopedTo: (tenantId) => new InMemoryAuditTrail(audit, tenantId),
  };
}

function postgresDocumentsPersistence(client: PostgresClient, cipher: FieldCipher): DocumentsPersistence {
  return {
    documentRegistry: new PostgresDocumentRepository(client.db, { kind: "registry" }, cipher),
    documentsScopedTo: (tenantId) => new PostgresDocumentRepository(client.db, { kind: "tenant", tenantId }, cipher),
    jobsScopedTo: (tenantId) => new PostgresJobQueue(client.db, { kind: "tenant", tenantId }),
    consentsScopedTo: (tenantId) => new PostgresConsentRepository(client.db, tenantId),
    auditScopedTo: (tenantId) => new PostgresAuditTrail(client.db, tenantId),
  };
}

function fieldCipherFor(environment: Environment, logger: Logger): FieldCipher {
  if (environment.nodeEnv === "test") return new InMemoryFieldCipher();
  if (environment.databaseUrl === undefined) return new InMemoryFieldCipher();
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
  const isTest = environment.nodeEnv === "test";
  if (
    isTest ||
    environment.supabaseUrl === undefined ||
    environment.supabaseServiceRoleKey === undefined ||
    environment.documentsBucket === undefined
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

type IdentityPersistence = Pick<
  Container,
  "userRegistry" | "membershipRegistry" | "membershipsScopedTo" | "apiKeyRegistry" | "apiKeysScopedTo"
>;

function memoryIdentityPersistence(): IdentityPersistence {
  const users = new InMemoryUserStore();
  const memberships = new InMemoryMembershipStore();
  const apiKeys = new InMemoryApiKeyStore();
  return {
    userRegistry: new InMemoryUserRepository(users, { kind: "registry" }),
    membershipRegistry: new InMemoryMembershipRepository(memberships, { kind: "registry" }),
    membershipsScopedTo: (tenantId) => new InMemoryMembershipRepository(memberships, { kind: "tenant", tenantId }),
    apiKeyRegistry: new InMemoryApiKeyRepository(apiKeys, { kind: "registry" }),
    apiKeysScopedTo: (tenantId) => new InMemoryApiKeyRepository(apiKeys, { kind: "tenant", tenantId }),
  };
}

function postgresIdentityPersistence(client: PostgresClient): IdentityPersistence {
  return {
    userRegistry: new PostgresUserRepository(client.db, { kind: "registry" }),
    membershipRegistry: new PostgresMembershipRepository(client.db, { kind: "registry" }),
    membershipsScopedTo: (tenantId) => new PostgresMembershipRepository(client.db, { kind: "tenant", tenantId }),
    apiKeyRegistry: new PostgresApiKeyRepository(client.db, { kind: "registry" }),
    apiKeysScopedTo: (tenantId) => new PostgresApiKeyRepository(client.db, { kind: "tenant", tenantId }),
  };
}

function identityParts(
  environment: Environment,
): Pick<Container, "identityProvider" | "apiKeyHasher" | "secretGenerator"> {
  const isTest = environment.nodeEnv === "test";
  const identityProvider: IdentityProvider =
    environment.supabaseUrl !== undefined && environment.supabaseAnonKey !== undefined && !isTest
      ? new SupabaseIdentityProvider({
          client: createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          }),
          timeoutMilliseconds: 5000,
        })
      : new InMemoryIdentityProvider();
  const apiKeyHasher: ApiKeyHasher =
    environment.apiKeyPepper !== undefined
      ? new Sha256ApiKeyHasher({ pepper: environment.apiKeyPepper })
      : new InMemoryApiKeyHasher();
  const secretGenerator: SecretGenerator = isTest ? new SequentialSecretGenerator() : new RandomSecretGenerator();
  return { identityProvider, apiKeyHasher, secretGenerator };
}

function humanVerifierFor(environment: Environment): HumanVerifier {
  if (environment.turnstileSecret === undefined || environment.nodeEnv === "test") {
    return new InMemoryHumanVerifier(environment.nodeEnv === "test" ? ["test-human-token"] : []);
  }
  return new TurnstileHumanVerifier(
    createTurnstileClient({ secret: environment.turnstileSecret, timeoutMilliseconds: 5000 }),
  );
}

function telemetryFor(environment: Environment, logger: Logger, policy: RedactionPolicy): { telemetry: Telemetry; otelClient: OtelClient | undefined } {
  if (environment.nodeEnv === "test") return { telemetry: new InMemoryTelemetry({ policy }), otelClient: undefined };
  if (environment.sentryDsn === undefined) {
    logger.warn("SENTRY_DSN is not configured: request and job spans are not exported anywhere");
    return { telemetry: new NoopTelemetry(), otelClient: undefined };
  }
  const otelClient = createOtelClient({
    serviceName: "base-web",
    endpoint: sentryOtlpEndpointFrom(environment.sentryDsn),
  });
  return { telemetry: new OtelTelemetry(otelClient.tracer, { policy }), otelClient };
}

function analyticsFor(environment: Environment, logger: Logger): Analytics {
  if (environment.nodeEnv === "test") return new InMemoryAnalytics();
  if (environment.gaMeasurementId === undefined || environment.gaApiSecret === undefined) {
    logger.warn("GA_MEASUREMENT_ID or GA_API_SECRET is not configured: server side analytics events are dropped");
    return new NoopAnalytics();
  }
  return new MeasurementProtocolAnalytics({
    measurementId: environment.gaMeasurementId,
    apiSecret: environment.gaApiSecret,
    timeoutMilliseconds: 5000,
  });
}

function mailerFor(environment: Environment, logger: Logger): Mailer {
  if (environment.nodeEnv === "test") return new InMemoryMailer();
  if (!isModuleActive("notifications")) return new ConsoleMailer();
  if (environment.nodeEnv === "development") return new ConsoleMailer();
  if (environment.resendApiKey === undefined) {
    logger.warn("RESEND_API_KEY is not configured: outgoing mail is only logged to the console, never delivered");
    return new ConsoleMailer();
  }
  return new ResendMailer({
    client: createResendClient({ apiKey: environment.resendApiKey }),
    from: environment.mailFrom,
    timeoutMs: environment.resendTimeoutMs,
  });
}

export function createContainer(environment: Environment): Container {
  const parts = environment.nodeEnv === "test" ? deterministicParts() : liveParts();

  const client =
    environment.nodeEnv !== "test" && environment.databaseUrl !== undefined
      ? createPostgresClient({ connectionString: environment.databaseUrl })
      : undefined;
  if (environment.nodeEnv === "production" && client === undefined) {
    parts.logger.warn(
      "DATABASE_URL is not configured: running production on in-memory persistence, every tenant, user and document is lost on restart",
    );
  }
  const persistence = client !== undefined ? postgresPersistence(client) : memoryPersistence();

  const identity = client !== undefined ? postgresIdentityPersistence(client) : memoryIdentityPersistence();

  const fieldCipher = fieldCipherFor(environment, parts.logger);
  const documents =
    client !== undefined ? postgresDocumentsPersistence(client, fieldCipher) : memoryDocumentsPersistence();

  const { telemetry, otelClient } = telemetryFor(environment, parts.logger, logRedactionPolicy);

  return {
    ...parts,
    ...persistence,
    ...identity,
    ...documents,
    telemetry,
    permissions: new RolePermissions({ membershipsScopedTo: identity.membershipsScopedTo }),
    ...identityParts(environment),
    fileStore: fileStoreFor(environment),
    documentProcessor: new NullDocumentProcessor(),
    humanVerifier: humanVerifierFor(environment),
    idempotencyStore: new InMemoryIdempotencyStore({ clock: parts.clock, timeToLiveMilliseconds: 24 * 60 * 60 * 1000 }),
    rateLimiter: new SlidingWindowRateLimiter({ clock: parts.clock }),
    mailer: mailerFor(environment, parts.logger),
    analytics: analyticsFor(environment, parts.logger),
    close: async () => {
      await client?.close();
      await otelClient?.shutdown();
    },
  };
}
