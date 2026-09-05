import { fallbackRateLimitBucket, type RateLimitPolicies, type RateLimitPolicy } from "./dependencies";
import type { ApiFailure } from "./failure";
import type { RateLimiter } from "./ports";

export const rateLimitLimitHeader = "X-RateLimit-Limit";
export const rateLimitRemainingHeader = "X-RateLimit-Remaining";
export const retryAfterHeader = "Retry-After";

export type RateLimitVerdict =
  | { readonly kind: "allowed"; readonly headers: Readonly<Record<string, string>> }
  | { readonly kind: "limited"; readonly reason: ApiFailure };

function policyFor(policies: RateLimitPolicies, bucket: string): RateLimitPolicy {
  return (
    policies[bucket] ??
    policies[fallbackRateLimitBucket] ?? { limit: 60, windowMilliseconds: 60_000 }
  );
}

export async function enforceRateLimit(request: {
  readonly limiter: RateLimiter;
  readonly policies: RateLimitPolicies;
  readonly bucket: string;
  readonly subject: string;
}): Promise<RateLimitVerdict> {
  const policy = policyFor(request.policies, request.bucket);
  const decision = await request.limiter.consume({
    bucket: request.bucket,
    subject: request.subject,
    limit: policy.limit,
    windowMilliseconds: policy.windowMilliseconds,
  });

  const limitHeaders = {
    [rateLimitLimitHeader]: String(policy.limit),
    [rateLimitRemainingHeader]: String(decision.remaining),
  };

  if (decision.allowed) return { kind: "allowed", headers: limitHeaders };

  const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMilliseconds / 1000));
  return {
    kind: "limited",
    reason: {
      status: 429,
      code: "rateLimit.exceeded",
      message: `Too many requests in the ${request.bucket} bucket`,
      headers: { ...limitHeaders, [retryAfterHeader]: String(retryAfterSeconds) },
    },
  };
}
