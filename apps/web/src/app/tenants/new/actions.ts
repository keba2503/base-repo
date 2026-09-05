"use server";

import { presentTenantForm, type TenantFormViewModel } from "@base/adapters";
import { redirect } from "next/navigation";
import { currentActor } from "@/main/actor";
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

  const outcome = await createTenantOperation()({ actor: currentActor(), payload });
  if (outcome.kind === "ok") redirect(`/tenants/${outcome.value.slug}`);

  return presentTenantForm(outcome, env.defaultLocale);
}
