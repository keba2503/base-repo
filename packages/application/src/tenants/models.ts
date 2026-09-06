import { resourceOfAction } from "@base/domain";
import type { Actor } from "../kernel/actor";

export type CreateTenantRequest = {
  readonly actor: Actor;
  readonly name: string;
  readonly slug: string;
};

export type GetTenantBySlugRequest = {
  readonly actor: Actor;
  readonly slug: string;
};

export type TenantResponse = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: Date;
};

export const createTenantAction = "tenants:create";
export const readTenantAction = "tenants:read";
export const tenantResource = resourceOfAction(createTenantAction);
