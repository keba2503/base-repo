import { isErr, notFound, ok, err, type DomainError, type Result } from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { Permissions } from "../kernel/ports/permissions";
import {
  readTenantAction,
  tenantResource,
  type GetTenantBySlugRequest,
  type TenantResponse,
} from "./models";
import type { TenantRepository } from "./ports/tenant-repository";

export type GetTenantBySlugDependencies = {
  readonly tenants: TenantRepository;
  readonly permissions: Permissions;
};

export type GetTenantBySlug = (
  request: GetTenantBySlugRequest,
) => Promise<Result<TenantResponse, DomainError>>;

export function getTenantBySlug(dependencies: GetTenantBySlugDependencies): GetTenantBySlug {
  const { tenants, permissions } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: readTenantAction,
      resource: tenantResource,
    });
    if (isErr(authorization)) return authorization;

    const tenant = await tenants.findBySlug(request.slug);
    if (!tenant) {
      return err(notFound("tenant.notFound", "No tenant uses this slug"));
    }

    return ok({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.createdAt,
    });
  };
}
