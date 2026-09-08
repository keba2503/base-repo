import "server-only";
import type { Actor } from "@base/application";
import { entityIdOf, isOk, parseEntityId, parseTenantId, type DomainError, type EntityId, type Result } from "@base/domain";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { env, isDevelopment } from "./env";
import { resolveActorFromApiKeyOperation, resolveActorFromSessionOperation } from "./use-cases";

const bearerPrefix = "Bearer ";
const apiKeyMarker = "ak_";
const platformTenantId = "00000000-0000-4000-8000-00000000f1a7";

async function sessionToken(): Promise<string | undefined> {
  if (env.supabaseUrl === undefined || env.supabaseAnonKey === undefined) return undefined;
  const store = await cookies();
  const client = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: { getAll: () => store.getAll(), setAll: () => undefined },
  });
  const { data } = await client.auth.getSession();
  return data.session?.access_token;
}

function bearerToken(authorization: string | null): string | undefined {
  if (authorization === null || !authorization.startsWith(bearerPrefix)) return undefined;
  return authorization.slice(bearerPrefix.length).trim();
}

export type ActorRequest = { readonly tenantSlug?: string | undefined; readonly tenantId?: string | undefined };

export async function resolveActor(request: ActorRequest = {}): Promise<Result<Actor, DomainError>> {
  const bearer = bearerToken((await headers()).get("authorization"));
  if (bearer !== undefined && bearer.startsWith(apiKeyMarker)) {
    return resolveActorFromApiKeyOperation()({ key: bearer });
  }
  const token = bearer ?? (await sessionToken());
  return resolveActorFromSessionOperation()({ token: token ?? "", tenantSlug: request.tenantSlug, tenantId: request.tenantId });
}

export function anonymousVisitorActor(subjectId: EntityId): Actor {
  const tenantId = parseTenantId(platformTenantId);
  if (!isOk(tenantId)) throw new Error("The platform tenant identifier is malformed");
  return {
    tenantId: tenantId.value,
    subjectId,
    kind: "system",
    scopes: ["consent:grant", "consent:withdraw", "consent:read"],
  };
}

export function visitorActorFor(existingVisitorId: string | undefined): { actor: Actor; visitorId: string } {
  const candidate = existingVisitorId ?? crypto.randomUUID();
  const parsed = parseEntityId(candidate);
  const visitorId = isOk(parsed) ? candidate : crypto.randomUUID();
  const finalParsed = isOk(parsed) ? parsed : parseEntityId(visitorId);
  if (!isOk(finalParsed)) throw new Error("Unable to mint a visitor identifier");
  return { actor: anonymousVisitorActor(finalParsed.value), visitorId };
}

export function cronActor(): Actor {
  const tenantId = parseTenantId(platformTenantId);
  if (!isOk(tenantId)) throw new Error("The platform tenant identifier is malformed");
  return {
    tenantId: tenantId.value,
    subjectId: entityIdOf(tenantId.value),
    kind: "system",
    scopes: ["outbox:dispatch", "jobQueue:dispatch"],
  };
}

export function providerCallbackActor(): Actor {
  const tenantId = parseTenantId(platformTenantId);
  if (!isOk(tenantId)) throw new Error("The platform tenant identifier is malformed");
  return {
    tenantId: tenantId.value,
    subjectId: entityIdOf(tenantId.value),
    kind: "system",
    scopes: ["payments:recordProviderEvent"],
  };
}

export function developmentActor(): Actor {
  const tenantId = parseTenantId(platformTenantId);
  if (!isOk(tenantId)) throw new Error("The platform tenant identifier is malformed");
  return {
    tenantId: tenantId.value,
    subjectId: entityIdOf(tenantId.value),
    kind: "system",
    scopes: ["tenants:create", "tenants:read", "outbox:dispatch"],
  };
}

export async function resolveActorOrDevelopmentFallback(request: ActorRequest = {}): Promise<Actor | undefined> {
  const actor = await resolveActor(request);
  if (isOk(actor)) return actor.value;
  return isDevelopment && env.allowInsecureDevActor ? developmentActor() : undefined;
}
