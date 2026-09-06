import {
  confirmDocumentUploadController,
  createApiKeyController,
  createDocumentUploadController,
  createTenantController,
  getDocumentController,
  getTenantBySlugController,
  listDocumentsController,
  revokeApiKeyController,
} from "@base/adapters";
import {
  FixedClock,
  InMemoryHumanVerifier,
  InMemoryIdempotencyStore,
  InMemoryTelemetry,
  RandomIdGenerator,
  SilentLogger,
  SlidingWindowRateLimiter,
} from "@base/infrastructure";
import { createApi, defaultRateLimits, type Actor, type Api, type ApiDependencies, type RouteDefinition } from "@/api";
import { developmentActor } from "@/main/actor";

type CreateTenantUseCase = Parameters<typeof createTenantController>[0];
type GetTenantBySlugUseCase = Parameters<typeof getTenantBySlugController>[0];
type CreateApiKeyUseCase = Parameters<typeof createApiKeyController>[0];
type RevokeApiKeyUseCase = Parameters<typeof revokeApiKeyController>[0];
type CreateDocumentUploadUseCase = Parameters<typeof createDocumentUploadController>[0];
type ConfirmDocumentUploadUseCase = Parameters<typeof confirmDocumentUploadController>[0];
type GetDocumentUseCase = Parameters<typeof getDocumentController>[0];
type ListDocumentsUseCase = Parameters<typeof listDocumentsController>[0];

export const apiKeySecret = "key-with-scopes";
export const secondApiKeySecret = "second-key";
export const sessionCookie = "session=valid-session";
export const secondSessionCookie = "session=other-session";
export const recognisedHumanToken = "human-token";

export const tenantResponse = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Acme Clinic",
  slug: "acme-clinic",
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
};

export const tenantOutput = { ...tenantResponse, createdAt: tenantResponse.createdAt.toISOString() };

export const validTenantPayload = { name: "Acme Clinic", slug: "acme-clinic" };

export const apiKeyCreatedResponse = {
  id: "00000000-0000-4000-8000-000000000030",
  tenantId: "00000000-0000-4000-8000-000000000001",
  name: "CI token",
  keyPrefix: "ak_00000000000040008000000000000030",
  scopes: ["tenants:read"],
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
  revokedAt: null,
  plaintextKey: "ak_00000000000040008000000000000030.secret",
};

export const apiKeyCreatedOutput = {
  id: apiKeyCreatedResponse.id,
  name: apiKeyCreatedResponse.name,
  keyPrefix: apiKeyCreatedResponse.keyPrefix,
  scopes: apiKeyCreatedResponse.scopes,
  createdAt: apiKeyCreatedResponse.createdAt.toISOString(),
  plaintextKey: apiKeyCreatedResponse.plaintextKey,
};

export const apiKeyRevokedResponse = {
  id: "00000000-0000-4000-8000-000000000030",
  tenantId: "00000000-0000-4000-8000-000000000001",
  name: "CI token",
  keyPrefix: "ak_00000000000040008000000000000030",
  scopes: ["tenants:read"],
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
  revokedAt: new Date("2026-02-01T00:00:00.000Z"),
};

export const apiKeyRevokedOutput = {
  id: apiKeyRevokedResponse.id,
  name: apiKeyRevokedResponse.name,
  keyPrefix: apiKeyRevokedResponse.keyPrefix,
  scopes: apiKeyRevokedResponse.scopes,
  createdAt: apiKeyRevokedResponse.createdAt.toISOString(),
  revokedAt: apiKeyRevokedResponse.revokedAt.toISOString(),
};

export const validCreateApiKeyPayload = { name: "CI token", scopes: ["tenants:read"] };
export const validRevokeApiKeyPayload = { apiKeyId: "00000000-0000-4000-8000-000000000030" };

export const documentResponse = {
  id: "00000000-0000-4000-8000-000000000040",
  tenantId: "00000000-0000-4000-8000-000000000001",
  originalFilename: "informe.pdf",
  contentType: "application/pdf",
  sizeBytes: 1_024,
  status: "pending",
  extractedText: null,
  failureReason: null,
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
  processedAt: null,
};

export const documentOutput = {
  ...documentResponse,
  createdAt: documentResponse.createdAt.toISOString(),
  processedAt: null,
};

export const createDocumentUploadResponse = {
  storageKey: "00000000-0000-4000-8000-000000000040",
  uploadUrl: "https://storage.example.com/upload/signed",
  expiresInSeconds: 300,
};

export const validConfirmDocumentUploadPayload = {
  storageKey: "00000000-0000-4000-8000-000000000040",
  filename: "informe.pdf",
};

export type HarnessOptions = {
  readonly createTenant?: CreateTenantUseCase;
  readonly getTenantBySlug?: GetTenantBySlugUseCase;
  readonly createApiKey?: CreateApiKeyUseCase;
  readonly revokeApiKey?: RevokeApiKeyUseCase;
  readonly createDocumentUpload?: CreateDocumentUploadUseCase;
  readonly confirmDocumentUpload?: ConfirmDocumentUploadUseCase;
  readonly getDocument?: GetDocumentUseCase;
  readonly listDocuments?: ListDocumentsUseCase;
  readonly routes?: readonly RouteDefinition[];
  readonly rateLimits?: ApiDependencies["rateLimits"];
};

export type Harness = {
  readonly api: Api;
  readonly clock: FixedClock;
  readonly actor: Actor;
  readonly secondActor: Actor;
  readonly dependencies: ApiDependencies;
};

export function ok<Value>(value: Value): { kind: "ok"; value: Value } {
  return { kind: "ok", value };
}

export function domainError(kind: "invariantViolation" | "notFound" | "conflict" | "forbidden", code: string, message: string) {
  return { kind: "err" as const, error: { kind, code, message } };
}

const succeedingCreate: CreateTenantUseCase = () => Promise.resolve(ok(tenantResponse));
const succeedingGet: GetTenantBySlugUseCase = () => Promise.resolve(ok(tenantResponse));
const succeedingCreateApiKey: CreateApiKeyUseCase = () => Promise.resolve(ok(apiKeyCreatedResponse));
const succeedingRevokeApiKey: RevokeApiKeyUseCase = () => Promise.resolve(ok(apiKeyRevokedResponse));
const succeedingCreateDocumentUpload: CreateDocumentUploadUseCase = () => Promise.resolve(ok(createDocumentUploadResponse));
const succeedingConfirmDocumentUpload: ConfirmDocumentUploadUseCase = () => Promise.resolve(ok(documentResponse));
const succeedingGetDocument: GetDocumentUseCase = () => Promise.resolve(ok(documentResponse));
const succeedingListDocuments: ListDocumentsUseCase = () => Promise.resolve(ok({ documents: [documentResponse] }));

export function harnessFactory(options: HarnessOptions = {}): Harness {
  const clock = new FixedClock(new Date("2026-01-15T10:00:00.000Z"));
  const actor = developmentActor();
  const secondActor: Actor = { ...actor, subjectId: new RandomIdGenerator().next() };

  const dependencies: ApiDependencies = {
    controllers: {
      createTenant: createTenantController(options.createTenant ?? succeedingCreate),
      getTenantBySlug: getTenantBySlugController(options.getTenantBySlug ?? succeedingGet),
      createApiKey: createApiKeyController(options.createApiKey ?? succeedingCreateApiKey),
      revokeApiKey: revokeApiKeyController(options.revokeApiKey ?? succeedingRevokeApiKey),
      createDocumentUpload: createDocumentUploadController(options.createDocumentUpload ?? succeedingCreateDocumentUpload),
      confirmDocumentUpload: confirmDocumentUploadController(options.confirmDocumentUpload ?? succeedingConfirmDocumentUpload),
      getDocument: getDocumentController(options.getDocument ?? succeedingGetDocument),
      listDocuments: listDocumentsController(options.listDocuments ?? succeedingListDocuments),
    },
    resolveActor: (credential) => {
      if (credential.kind === "apiKey" && credential.secret === apiKeySecret) return Promise.resolve(actor);
      if (credential.kind === "apiKey" && credential.secret === secondApiKeySecret) return Promise.resolve(secondActor);
      if (credential.kind === "session" && credential.cookieHeader.includes(sessionCookie)) return Promise.resolve(actor);
      if (credential.kind === "session" && credential.cookieHeader.includes(secondSessionCookie)) return Promise.resolve(secondActor);
      if (credential.kind === "anonymous") return Promise.resolve(actor);
      return Promise.resolve(undefined);
    },
    logger: new SilentLogger(),
    telemetry: new InMemoryTelemetry(),
    humanVerifier: new InMemoryHumanVerifier([recognisedHumanToken]),
    idempotencyStore: new InMemoryIdempotencyStore({ clock, timeToLiveMilliseconds: 60_000 }),
    rateLimiter: new SlidingWindowRateLimiter({ clock }),
    rateLimits: options.rateLimits ?? defaultRateLimits,
    documentation: { title: "Test API", version: "0.0.1", serverUrl: "/api", sessionCookieName: "session" },
  };

  return { api: createApi(dependencies, options.routes), clock, actor, secondActor, dependencies };
}

export function postTenant(
  api: Api,
  payload: unknown,
  headers: Readonly<Record<string, string>> = { cookie: sessionCookie },
): Promise<Response> {
  return Promise.resolve(
    api.request("/api/v1/tenants", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
}

export function getTenant(
  api: Api,
  slug: string,
  headers: Readonly<Record<string, string>> = { authorization: `Bearer ${apiKeySecret}` },
): Promise<Response> {
  return Promise.resolve(api.request(`/api/v1/tenants/${slug}`, { headers }));
}

export function postApiKey(
  api: Api,
  payload: unknown,
  headers: Readonly<Record<string, string>> = { cookie: sessionCookie },
): Promise<Response> {
  return Promise.resolve(
    api.request("/api/v1/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
}

export function postRevokeApiKey(
  api: Api,
  payload: unknown,
  headers: Readonly<Record<string, string>> = { cookie: sessionCookie },
): Promise<Response> {
  return Promise.resolve(
    api.request("/api/v1/api-keys/revoke", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
}

export function postConfirmDocument(
  api: Api,
  payload: unknown,
  headers: Readonly<Record<string, string>> = { cookie: sessionCookie },
): Promise<Response> {
  return Promise.resolve(
    api.request("/api/v1/documents", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
}

export function postCreateDocumentUpload(
  api: Api,
  payload: unknown = {},
  headers: Readonly<Record<string, string>> = { cookie: sessionCookie },
): Promise<Response> {
  return Promise.resolve(
    api.request("/api/v1/documents/upload-urls", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
}

export function getDocumentByPath(
  api: Api,
  documentId: string,
  headers: Readonly<Record<string, string>> = { authorization: `Bearer ${apiKeySecret}` },
): Promise<Response> {
  return Promise.resolve(api.request(`/api/v1/documents/${documentId}`, { headers }));
}

export function getDocuments(
  api: Api,
  query = "",
  headers: Readonly<Record<string, string>> = { authorization: `Bearer ${apiKeySecret}` },
): Promise<Response> {
  return Promise.resolve(api.request(`/api/v1/documents${query}`, { headers }));
}

export async function errorOf(response: Response): Promise<{ code: string; message: string; requestId: string; issues?: unknown }> {
  const body: { error: { code: string; message: string; requestId: string; issues?: unknown } } = await response.json();
  return body.error;
}
