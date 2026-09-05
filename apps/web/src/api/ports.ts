export type LogFields = Readonly<Record<string, unknown>>;

export type Logger = {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

export type HumanVerification =
  | { readonly kind: "human" }
  | { readonly kind: "rejected"; readonly reason: string };

export type HumanVerifier = {
  verify(request: { readonly token: string; readonly remoteAddress?: string }): Promise<HumanVerification>;
};

export type IdempotencyKey = {
  readonly scope: string;
  readonly key: string;
};

export type IdempotentReply = {
  readonly status: number;
  readonly body: string;
};

export type IdempotencyRecord = IdempotencyKey & {
  readonly fingerprint: string;
  readonly reply: IdempotentReply;
};

export type IdempotencyStore = {
  find(key: IdempotencyKey): Promise<IdempotencyRecord | undefined>;
  save(record: IdempotencyRecord): Promise<void>;
};

export type RateLimitDecision = {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMilliseconds: number;
};

export type RateLimiter = {
  consume(request: {
    readonly bucket: string;
    readonly subject: string;
    readonly limit: number;
    readonly windowMilliseconds: number;
  }): Promise<RateLimitDecision>;
};
