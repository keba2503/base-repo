import type {
  ConfirmDocumentUploadController,
  CreateApiKeyController,
  CreateDocumentUploadController,
  CreateTenantCommand,
  CreateTenantController,
  GetDocumentController,
  GetTenantBySlugController,
  ListDocumentsController,
  RevokeApiKeyController,
} from "@base/adapters";
import type { HumanVerifier, IdempotencyStore, Logger, RateLimiter, Telemetry } from "./ports";

export type Actor = CreateTenantCommand["actor"];

export type Credential =
  | { readonly kind: "apiKey"; readonly secret: string }
  | { readonly kind: "session"; readonly cookieHeader: string }
  | { readonly kind: "anonymous"; readonly remoteAddress: string };

export type ActorResolver = (credential: Credential) => Promise<Actor | undefined>;

export type DocumentControllers = {
  readonly createDocumentUpload: CreateDocumentUploadController;
  readonly confirmDocumentUpload: ConfirmDocumentUploadController;
  readonly getDocument: GetDocumentController;
  readonly listDocuments: ListDocumentsController;
};

export type ApiControllers = {
  readonly createTenant: CreateTenantController;
  readonly getTenantBySlug: GetTenantBySlugController;
  readonly createApiKey: CreateApiKeyController;
  readonly revokeApiKey: RevokeApiKeyController;
  readonly documents?: DocumentControllers;
};

export type RateLimitPolicy = {
  readonly limit: number;
  readonly windowMilliseconds: number;
};

export type RateLimitPolicies = Readonly<Record<string, RateLimitPolicy>>;

export type ApiDocumentation = {
  readonly title: string;
  readonly version: string;
  readonly serverUrl: string;
  readonly sessionCookieName: string;
};

export type ApiDependencies = {
  readonly controllers: ApiControllers;
  readonly resolveActor: ActorResolver;
  readonly logger: Logger;
  readonly telemetry: Telemetry;
  readonly humanVerifier: HumanVerifier;
  readonly idempotencyStore: IdempotencyStore;
  readonly rateLimiter: RateLimiter;
  readonly rateLimits: RateLimitPolicies;
  readonly documentation: ApiDocumentation;
};

const oneMinute = 60_000;

export const fallbackRateLimitBucket = "default";

export const defaultRateLimits: RateLimitPolicies = {
  [fallbackRateLimitBucket]: { limit: 60, windowMilliseconds: oneMinute },
  "tenants-write": { limit: 10, windowMilliseconds: oneMinute },
  "tenants-read": { limit: 120, windowMilliseconds: oneMinute },
  "apikeys-write": { limit: 10, windowMilliseconds: oneMinute },
  "documents-write": { limit: 20, windowMilliseconds: oneMinute },
  "documents-read": { limit: 120, windowMilliseconds: oneMinute },
};
