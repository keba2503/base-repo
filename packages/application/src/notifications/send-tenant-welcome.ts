import { err, notFound, type TenantCreated } from "@base/domain";
import type { TenantRepository } from "../tenants/ports/tenant-repository";
import type { EventHandler } from "./event-handler";
import type { TenantWelcomeMessageFactory } from "./models";
import type { Mailer } from "./ports/mailer";

export const tenantCreatedEventName: TenantCreated["name"] = "tenant.created";

export type SendTenantWelcomeDependencies = {
  readonly tenants: TenantRepository;
  readonly mailer: Mailer;
  readonly presentMessage: TenantWelcomeMessageFactory;
};

export function sendTenantWelcome(dependencies: SendTenantWelcomeDependencies): EventHandler {
  const { tenants, mailer, presentMessage } = dependencies;

  return {
    eventName: tenantCreatedEventName,
    async handle(event) {
      const tenant = await tenants.findById(event.tenantId);
      if (!tenant) {
        return err(notFound("tenant.notFound", "The created tenant is no longer stored"));
      }

      const message = presentMessage({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        createdAt: tenant.createdAt,
      });
      return mailer.send(message);
    },
  };
}
