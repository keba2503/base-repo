import { createTenant, getTenantBySlug } from "@base/application";
import {
  createTenantController,
  getTenantBySlugController,
  type CreateTenantController,
  type GetTenantBySlugController,
} from "@base/adapters";
import { createContainer, type Container } from "./container";
import { env } from "./env";

let shared: Container | undefined;

function container(): Container {
  shared ??= createContainer(env);
  return shared;
}

export function createTenantOperation(): CreateTenantController {
  const parts = container();
  return createTenantController(
    createTenant({
      tenants: parts.tenantRegistry,
      permissions: parts.permissions,
      clock: parts.clock,
      idGenerator: parts.idGenerator,
      unitOfWork: parts.unitOfWork,
      outbox: parts.outbox,
    }),
  );
}

export function getTenantBySlugOperation(): GetTenantBySlugController {
  const parts = container();
  return getTenantBySlugController(
    getTenantBySlug({ tenants: parts.tenantRegistry, permissions: parts.permissions }),
  );
}
