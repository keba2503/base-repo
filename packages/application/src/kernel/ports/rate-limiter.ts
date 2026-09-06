export type RateLimitRequest = {
  readonly bucket: string;
  readonly subject: string;
  readonly limit: number;
  readonly windowMilliseconds: number;
};

export type RateLimitDecision = {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMilliseconds: number;
};

export type RateLimiter = {
  consume(request: RateLimitRequest): Promise<RateLimitDecision>;
};
