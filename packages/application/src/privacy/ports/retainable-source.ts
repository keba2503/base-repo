import type { EntityId, TenantId } from "@base/domain";
import type { AnonymizableSource } from "./anonymizable-source";

export type RetainableSource = AnonymizableSource & {
  findSubjectsOlderThan(tenantId: TenantId, cutoff: Date): Promise<readonly EntityId[]>;
};

export type RetentionPolicy = Readonly<Record<string, number>>;
