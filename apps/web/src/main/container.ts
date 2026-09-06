import type {
  ApiKeyHasher,
  ApiKeyRepository,
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
  TenantRepository,
  UnitOfWork,
  UserRepository,
} from "@base/application";
import { RolePermissions } from "@base/application";
import {
  apiKeyFieldClassifications,
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
  InMemoryApiKeyHasher,
  InMemoryApiKeyRepository,
  InMemoryApiKeyStore,
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
  InMemoryTenantRepository,
  InMemoryTenantStore,
  InMemoryUnitOfWork,
  InMemoryUserRepository,
  InMemoryUserStore,
  NullDocumentProcessor,
  PostgresApiKeyRepository,
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
  SequentialIdGenerator,
  SequentialSecretGenerator,
  Sha256ApiKeyHasher,
  SilentLogger,
  SlidingWindowRateLimiter,
  SupabaseFileStore,
  SupabaseIdentityProvider,
  SystemClock,
  TurnstileHumanVerifier,
  type PostgresClient,
} from "@base/infrastructure";
import { createClient } from "@supabase/supabase-js";
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
  readonly userRegistry: UserRepository;
  readonly membershipRegistry: MembershipRepository;
  membershipsScopedTo(tenantId: TenantId): MembershipRepository;
  readonly apiKeyRegistry: ApiKeyRepository;
  apiKeysScopedTo(tenantId: TenantId): ApiKeyRepository;
  readonly documentRegistry: DocumentRepository;
  documentsScopedTo(tenantId: TenantId): DocumentRepository;
  jobsScopedTo(tenantId: TenantId): JobQueue;
  consentsScopedTo(tenantId: TenantId): ConsentRepository;
  readonly fileStore: FileStore;
  readonly documentProcessor: DocumentProcessor;
  readonly identityProvider: IdentityProvider;
  readonly apiKeyHasher: ApiKeyHasher;
  readonly secretGenerator: SecretGenerator;
  readonly humanVerifier: HumanVerifier;
  readonly idempotencyStore: IdempotencyStore;
  readonly rateLimiter: RateLimiter;
  readonly mailer: Mailer;
  close(): Promise<void>;
};

const logRedactionPolicy = redactionPolicyFrom(
  tenantFieldClassifications,
  userFieldClassifications,
  apiKeyFieldClassifications,
  membershipFieldClassifications,
  documentFieldClassifications,
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
  "documentRegistry" | "documentsScopedTo" | "jobsScopedTo" | "consentsScopedTo"
>;

function memoryDocumentsPersistence(): DocumentsPersistence {
  const documents = new InMemoryDocumentStore();
  const jobs = new InMemoryJobStore();
  const consents = new InMemoryConsentStore();
  return {
    documentRegistry: new InMemoryDocumentRepository(documents, { kind: "registry" }),
    documentsScopedTo: (tenantId) => new InMemoryDocumentRepository(documents, { kind: "tenant", tenantId }),
    jobsScopedTo: (tenantId) => new InMemoryJobQueue(jobs, { kind: "tenant", tenantId }),
    consentsScopedTo: (tenantId) => new InMemoryConsentRepository(consents, tenantId),
  };
}

function postgresDocumentsPersistence(client: PostgresClient, cipher: FieldCipher): DocumentsPersistence {
  return {
    documentRegistry: new PostgresDocumentRepository(client.db, { kind: "registry" }, cipher),
    documentsScopedTo: (tenantId) => new PostgresDocumentRepository(client.db, { kind: "tenant", tenantId }, cipher),
    jobsScopedTo: (tenantId) => new PostgresJobQueue(client.db, { kind: "tenant", tenantId }),
    consentsScopedTo: (tenantId) => new PostgresConsentRepository(client.db, tenantId),
  };
}

function fieldCipherFor(environment: Environment): FieldCipher {
  if (environment.nodeEnv === "test") return new InMemoryFieldCipher();
  if (environment.fieldEncryptionKeys === undefined) {
    return new AesGcmFieldCipher({ keys: [{ id: "dev", key: crypto.getRandomValues(Buffer.alloc(32)) }] });
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
  const parts = environment.nodeEnv === "test" ? deterministicParts() : liveParts();

  const client =
    environment.nodeEnv !== "test" && environment.databaseUrl !== undefined
      ? createPostgresClient({ connectionString: environment.databaseUrl })
      : undefined;
  const persistence = client !== undefined ? postgresPersistence(client) : memoryPersistence();

  const identity = client !== undefined ? postgresIdentityPersistence(client) : memoryIdentityPersistence();

  const fieldCipher = fieldCipherFor(environment);
  const documents =
    client !== undefined ? postgresDocumentsPersistence(client, fieldCipher) : memoryDocumentsPersistence();

  return {
    ...parts,
    ...persistence,
    ...identity,
    ...documents,
    permissions: new RolePermissions({ membershipsScopedTo: identity.membershipsScopedTo }),
    ...identityParts(environment),
    fileStore: fileStoreFor(environment),
    documentProcessor: new NullDocumentProcessor(),
    humanVerifier: humanVerifierFor(environment),
    idempotencyStore: new InMemoryIdempotencyStore({ clock: parts.clock, timeToLiveMilliseconds: 24 * 60 * 60 * 1000 }),
    rateLimiter: new SlidingWindowRateLimiter({ clock: parts.clock }),
    mailer: mailerFor(environment),
    close: () => client?.close() ?? Promise.resolve(),
  };
}
