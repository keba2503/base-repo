"use server";

import { presentTenantForm, type TenantFormViewModel } from "@base/adapters";
import { redirect } from "next/navigation";
import { resolveActorOrDevelopmentFallback } from "@/main/actor";
import { env } from "@/main/env";
import { createTenantOperation } from "@/main/use-cases";

export async function submitTenant(
  _previous: TenantFormViewModel,
  formData: FormData,
): Promise<TenantFormViewModel> {
  const payload = {
    name: formData.get("name"),
    slug: formData.get("slug"),
  };

  const actor = await resolveActorOrDevelopmentFallback();
  if (actor === undefined) redirect("/login");

  const outcome = await createTenantOperation()({ actor, payload });
  if (outcome.kind === "ok") redirect(`/tenants/${outcome.value.slug}`);

  return presentTenantForm(outcome, env.defaultLocale);
}
