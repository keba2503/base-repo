import type { EntityId, TenantId } from "@base/domain";

export type ActorKind = "user" | "apiKey" | "system";

export type Actor = {
  readonly tenantId: TenantId;
  readonly subjectId: EntityId;
  readonly kind: ActorKind;
  readonly scopes: readonly string[];
};
