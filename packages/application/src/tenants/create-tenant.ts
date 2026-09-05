import {
  conflict,
  err,
  isErr,
  ok,
  Tenant,
  tenantIdOf,
  type DomainError,
  type Result,
} from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { Clock } from "../kernel/ports/clock";
import type { IdGenerator } from "../kernel/ports/id-generator";
import type { Outbox } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { UnitOfWork } from "../kernel/ports/unit-of-work";
import {
  createTenantAction,
  tenantResource,
  type CreateTenantRequest,
  type TenantResponse,
} from "./models";
import type { TenantRepository } from "./ports/tenant-repository";

export type CreateTenantDependencies = {
  readonly tenants: TenantRepository;
  readonly permissions: Permissions;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly outbox: Outbox;
};

export type CreateTenant = (request: CreateTenantRequest) => Promise<Result<TenantResponse, DomainError>>;

export function createTenant(dependencies: CreateTenantDependencies): CreateTenant {
  const { tenants, permissions, clock, idGenerator, unitOfWork, outbox } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: createTenantAction,
      resource: tenantResource,
    });
    if (isErr(authorization)) return authorization;

    const taken = await tenants.findBySlug(request.slug);
    if (taken) {
      return err(conflict("tenant.slug.taken", "Another tenant already uses this slug"));
    }

    const created = Tenant.create({
      id: tenantIdOf(idGenerator.next()),
      name: request.name,
      slug: request.slug,
      createdAt: clock.now(),
    });
    if (isErr(created)) return created;

    const tenant = created.value;
    await unitOfWork.run(async () => {
      await tenants.save(tenant);
      await outbox.enqueue(tenant.pullEvents());
    });

    return ok({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.createdAt,
    });
  };
}
