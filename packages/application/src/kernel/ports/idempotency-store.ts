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
