import type { Actor, GetTenantBySlug, TenantResponse } from "@base/application";
import { isErr } from "@base/domain";
import { failed, succeeded, type Outcome } from "../kernel/outcome";

export type GetTenantBySlugQuery = {
  readonly actor: Actor;
  readonly slug: string;
};

export type GetTenantBySlugController = (query: GetTenantBySlugQuery) => Promise<Outcome<TenantResponse>>;

export function getTenantBySlugController(useCase: GetTenantBySlug): GetTenantBySlugController {
  return async (query) => {
    const result = await useCase({ actor: query.actor, slug: query.slug });
    if (isErr(result)) return failed(result.error);
    return succeeded(result.value);
  };
}
