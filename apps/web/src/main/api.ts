import {
  ConsoleLogger,
  InMemoryHumanVerifier,
  InMemoryIdempotencyStore,
  SilentLogger,
  SlidingWindowRateLimiter,
  SystemClock,
} from "@base/infrastructure";
import { defaultRateLimits, type ActorResolver, type ApiDependencies, type Logger } from "@/api";
import { env } from "./env";
import { createTenantOperation, getTenantBySlugOperation } from "./use-cases";

const idempotencyTimeToLiveMilliseconds = 24 * 60 * 60 * 1000;

const tenantRedactionPolicy = { name: "personal" } as const;

const unwiredActorResolver: ActorResolver = () => Promise.resolve(undefined);

function apiLogger(): Logger {
  return env.nodeEnv === "test" ? new SilentLogger() : new ConsoleLogger({ policy: tenantRedactionPolicy });
}

function buildApiDependencies(): ApiDependencies {
  const clock = new SystemClock();
  const logger = apiLogger();
  logger.warn("api actor resolution is not wired yet; every credential is refused with 401");

  return {
    controllers: {
      createTenant: createTenantOperation(),
      getTenantBySlug: getTenantBySlugOperation(),
    },
    resolveActor: unwiredActorResolver,
    logger,
    humanVerifier: new InMemoryHumanVerifier([]),
    idempotencyStore: new InMemoryIdempotencyStore({ clock, timeToLiveMilliseconds: idempotencyTimeToLiveMilliseconds }),
    rateLimiter: new SlidingWindowRateLimiter({ clock }),
    rateLimits: defaultRateLimits,
    documentation: {
      title: "Base API",
      version: "1.0.0",
      serverUrl: "/api",
      sessionCookieName: "session",
    },
  };
}

let shared: ApiDependencies | undefined;

export function apiDependencies(): ApiDependencies {
  shared ??= buildApiDependencies();
  return shared;
}
