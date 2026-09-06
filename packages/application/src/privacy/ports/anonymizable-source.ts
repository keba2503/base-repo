import type { EntityId, TenantId } from "@base/domain";

export type AnonymizableSource = {
  readonly sourceName: string;
  anonymize(tenantId: TenantId, subjectId: EntityId, token: string, at: Date): Promise<boolean>;
};
