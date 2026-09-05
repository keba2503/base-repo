"use client";

import { useActionState } from "react";
import type { TenantFormViewModel } from "@base/adapters";
import { submitTenant } from "./actions";

export function TenantForm({ initial }: { initial: TenantFormViewModel }) {
  const [form, action, pending] = useActionState<TenantFormViewModel, FormData>(
    submitTenant,
    initial,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1" htmlFor="name">
        <span>{form.nameLabel}</span>
        <input
          className="border border-foreground/20 px-3 py-2"
          id="name"
          name="name"
          required
          type="text"
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor="slug">
        <span>{form.slugLabel}</span>
        <input
          className="border border-foreground/20 px-3 py-2"
          id="slug"
          name="slug"
          required
          type="text"
        />
      </label>
      {form.hasErrors ? (
        <ul className="text-accent">
          {form.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <button className="bg-foreground px-4 py-2 text-background" disabled={pending} type="submit">
        {form.submitLabel}
      </button>
    </form>
  );
}
