import { presentTenant } from "@base/adapters";
import { notFound } from "next/navigation";
import { currentActor } from "@/main/actor";
import { env } from "@/main/env";
import { getTenantBySlugOperation } from "@/main/use-cases";

export default async function TenantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const outcome = await getTenantBySlugOperation()({ actor: currentActor(), slug });
  if (outcome.kind !== "ok") notFound();

  const tenant = presentTenant(outcome.value, env.defaultLocale);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-2 p-8">
      <h1 className="text-2xl">{tenant.name}</h1>
      <p>{tenant.slug}</p>
      <p>{tenant.createdAtLabel}</p>
    </main>
  );
}
