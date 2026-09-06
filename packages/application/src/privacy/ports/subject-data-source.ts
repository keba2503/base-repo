import type { EntityId, FieldClassifications, TenantId } from "@base/domain";

export type SubjectDataRow = Readonly<Record<string, unknown>>;

export type SubjectDataSource = {
  readonly sourceName: string;
  readonly classifications: FieldClassifications<SubjectDataRow>;
  findAllForSubject(tenantId: TenantId, subjectId: EntityId): Promise<readonly SubjectDataRow[]>;
};
