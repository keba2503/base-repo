import { emptyTenantForm } from "@base/adapters";
import { env } from "@/main/env";
import { TenantForm } from "./tenant-form";

export default function NewTenantPage() {
  const form = emptyTenantForm(env.defaultLocale);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl">{form.title}</h1>
      <TenantForm initial={form} />
    </main>
  );
}
