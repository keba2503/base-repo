import type { Actor as ApplicationActor } from "@base/application";
import { defaultRateLimits, type ActorResolver, type ApiDependencies, type Credential } from "@/api";
import { env } from "./env";
import {
  confirmDocumentUploadOperation,
  createApiKeyOperation,
  createDocumentUploadOperation,
  createTenantOperation,
  getDocumentOperation,
  getTenantBySlugOperation,
  listDocumentsOperation,
  resolveActorFromApiKeyOperation,
  resolveActorFromSessionOperation,
  revokeApiKeyOperation,
  sharedContainer,
} from "./use-cases";
import { isOk } from "@base/domain";

function sessionTokenFromCookieHeader(cookieHeader: string): string | undefined {
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    const name = pair.slice(0, separator).trim();
    if (name === env.sessionCookieName) return decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return undefined;
}

function apiActorResolver(): ActorResolver {
  return async (credential: Credential): Promise<ApplicationActor | undefined> => {
    if (credential.kind === "apiKey") {
      const resolved = await resolveActorFromApiKeyOperation()({ key: credential.secret });
      return isOk(resolved) ? resolved.value : undefined;
    }
    if (credential.kind === "session") {
      const token = sessionTokenFromCookieHeader(credential.cookieHeader);
      if (token === undefined) return undefined;
      const resolved = await resolveActorFromSessionOperation()({ token });
      return isOk(resolved) ? resolved.value : undefined;
    }
    return undefined;
  };
}

function buildApiDependencies(): ApiDependencies {
  const parts = sharedContainer();

  return {
    controllers: {
      createTenant: createTenantOperation(),
      getTenantBySlug: getTenantBySlugOperation(),
      createApiKey: createApiKeyOperation(),
      revokeApiKey: revokeApiKeyOperation(),
      createDocumentUpload: createDocumentUploadOperation(),
      confirmDocumentUpload: confirmDocumentUploadOperation(),
      getDocument: getDocumentOperation(),
      listDocuments: listDocumentsOperation(),
    },
    resolveActor: apiActorResolver(),
    logger: parts.logger,
    humanVerifier: parts.humanVerifier,
    idempotencyStore: parts.idempotencyStore,
    rateLimiter: parts.rateLimiter,
    rateLimits: defaultRateLimits,
    documentation: {
      title: env.apiTitle,
      version: env.apiVersion,
      serverUrl: env.apiServerUrl,
      sessionCookieName: env.sessionCookieName,
    },
  };
}

let shared: ApiDependencies | undefined;

export function apiDependencies(): ApiDependencies {
  shared ??= buildApiDependencies();
  return shared;
}
