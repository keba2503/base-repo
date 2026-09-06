import { createTenantController, getTenantBySlugController } from "@base/adapters";
import {
  FixedClock,
  InMemoryHumanVerifier,
  InMemoryIdempotencyStore,
  RandomIdGenerator,
  SilentLogger,
  SlidingWindowRateLimiter,
} from "@base/infrastructure";
import { createApi, defaultRateLimits, type Actor, type Api, type ApiDependencies, type RouteDefinition } from "@/api";
import { developmentActor } from "@/main/actor";

type CreateTenantUseCase = Parameters<typeof createTenantController>[0];
type GetTenantBySlugUseCase = Parameters<typeof getTenantBySlugController>[0];

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

export type HarnessOptions = {
  readonly createTenant?: CreateTenantUseCase;
  readonly getTenantBySlug?: GetTenantBySlugUseCase;
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

export function harnessFactory(options: HarnessOptions = {}): Harness {
  const clock = new FixedClock(new Date("2026-01-15T10:00:00.000Z"));
  const actor = developmentActor();
  const secondActor: Actor = { ...actor, subjectId: new RandomIdGenerator().next() };

  const dependencies: ApiDependencies = {
    controllers: {
      createTenant: createTenantController(options.createTenant ?? succeedingCreate),
      getTenantBySlug: getTenantBySlugController(options.getTenantBySlug ?? succeedingGet),
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

export async function errorOf(response: Response): Promise<{ code: string; message: string; requestId: string; issues?: unknown }> {
  const body: { error: { code: string; message: string; requestId: string; issues?: unknown } } = await response.json();
  return body.error;
}
