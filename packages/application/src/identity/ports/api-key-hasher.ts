export type HashApiKeyRequest = {
  readonly key: string;
};

export type VerifyApiKeyRequest = {
  readonly key: string;
  readonly hash: string;
};

export type ApiKeyHasher = {
  hash(request: HashApiKeyRequest): Promise<string>;
  verify(request: VerifyApiKeyRequest): Promise<boolean>;
};
