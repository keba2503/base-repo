import type { ApiKey, EntityId } from "@base/domain";

export type ApiKeyRepository = {
  findByPrefix(keyPrefix: string): Promise<ApiKey | undefined>;
  findById(id: EntityId): Promise<ApiKey | undefined>;
  save(apiKey: ApiKey): Promise<void>;
};
