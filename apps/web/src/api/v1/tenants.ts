import type { Outcome } from "@base/adapters";
import { createTenantContract, getTenantBySlugContract, parseContractInput, type TenantOutput } from "@base/contracts";
import type { ApiControllers } from "../dependencies";
import type { RouteDefinition } from "../route-definition";

type TenantResponse = Extract<Awaited<ReturnType<ApiControllers["getTenantBySlug"]>>, { kind: "ok" }>["value"];

function toTenantOutput(response: TenantResponse): TenantOutput {
  return {
    id: response.id,
    name: response.name,
    slug: response.slug,
    createdAt: response.createdAt.toISOString(),
  };
}

function serialised(outcome: Outcome<TenantResponse>): Outcome<TenantOutput> {
  if (outcome.kind !== "ok") return outcome;
  return { kind: "ok", value: toTenantOutput(outcome.value) };
}

export function tenantRoutes(controllers: ApiControllers): readonly RouteDefinition[] {
  return [
    {
      operationId: "createTenant",
      summary: "Create a tenant",
      tag: "tenants",
      method: "post",
      path: "/v1/tenants",
      contract: createTenantContract,
      inputLocation: "body",
      successStatus: 201,
      execute: async ({ actor, payload }) => serialised(await controllers.createTenant({ actor, payload })),
    },
    {
      operationId: "getTenantBySlug",
      summary: "Get a tenant by slug",
      tag: "tenants",
      method: "get",
      path: "/v1/tenants/{slug}",
      contract: getTenantBySlugContract,
      inputLocation: "path",
      successStatus: 200,
      execute: async ({ actor, payload }) => {
        const parsed = parseContractInput(getTenantBySlugContract, payload);
        if (parsed.kind === "invalid") return { kind: "invalid", issues: parsed.issues };
        return serialised(await controllers.getTenantBySlug({ actor, slug: parsed.input.slug }));
      },
    },
  ];
}
