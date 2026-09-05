import type { TenantResponse } from "@base/application";

export type TenantViewModel = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly createdAtLabel: string;
  readonly href: string;
};

export function presentTenant(response: TenantResponse, locale: string): TenantViewModel {
  const createdAtLabel = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(response.createdAt);

  return {
    id: response.id,
    name: response.name,
    slug: response.slug,
    createdAtLabel,
    href: `/tenants/${response.slug}`,
  };
}
