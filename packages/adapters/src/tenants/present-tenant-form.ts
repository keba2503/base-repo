import type { TenantResponse } from "@base/application";
import type { Outcome } from "../kernel/outcome";

export type TenantFormViewModel = {
  readonly title: string;
  readonly nameLabel: string;
  readonly slugLabel: string;
  readonly submitLabel: string;
  readonly hasErrors: boolean;
  readonly errors: readonly string[];
};

const messagesByLocale: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  es: {
    "form.title": "Nueva organización",
    "form.name": "Nombre",
    "form.slug": "Identificador",
    "form.submit": "Crear",
    "tenant.slug.taken": "Ese identificador ya está en uso.",
    "tenant.name.length": "El nombre debe tener entre 2 y 80 caracteres.",
    "tenant.slug.length": "El identificador debe tener entre 3 y 40 caracteres.",
    "tenant.slug.format": "El identificador solo admite minúsculas, dígitos y guiones simples.",
    "authorization.denied": "No tienes permiso para crear organizaciones.",
    "field.name": "Revisa el nombre.",
    "field.slug": "Revisa el identificador.",
  },
  en: {
    "form.title": "New organisation",
    "form.name": "Name",
    "form.slug": "Identifier",
    "form.submit": "Create",
    "tenant.slug.taken": "That identifier is already taken.",
    "tenant.name.length": "The name must have between 2 and 80 characters.",
    "tenant.slug.length": "The identifier must have between 3 and 40 characters.",
    "tenant.slug.format": "The identifier accepts lowercase letters, digits and single hyphens only.",
    "authorization.denied": "You may not create organisations.",
    "field.name": "Check the name.",
    "field.slug": "Check the identifier.",
  },
};

function languageOf(locale: string): string {
  return locale.split("-")[0] ?? "en";
}

function translate(locale: string, key: string, fallback: string): string {
  const language = languageOf(locale);
  return messagesByLocale[language]?.[key] ?? messagesByLocale.en?.[key] ?? fallback;
}

type TenantFormLabels = Pick<
  TenantFormViewModel,
  "title" | "nameLabel" | "slugLabel" | "submitLabel"
>;

function labelsFor(locale: string): TenantFormLabels {
  return {
    title: translate(locale, "form.title", "New organisation"),
    nameLabel: translate(locale, "form.name", "Name"),
    slugLabel: translate(locale, "form.slug", "Identifier"),
    submitLabel: translate(locale, "form.submit", "Create"),
  };
}

export function emptyTenantForm(locale: string): TenantFormViewModel {
  return { ...labelsFor(locale), hasErrors: false, errors: [] };
}

export function presentTenantForm(
  outcome: Outcome<TenantResponse>,
  locale: string,
): TenantFormViewModel {
  const labels = labelsFor(locale);
  if (outcome.kind === "ok") return { ...labels, hasErrors: false, errors: [] };

  if (outcome.kind === "invalid") {
    const errors = outcome.issues.map((issue) =>
      translate(locale, issue.path === "" ? issue.code : `field.${issue.path}`, issue.message),
    );
    return { ...labels, hasErrors: true, errors };
  }

  return {
    ...labels,
    hasErrors: true,
    errors: [translate(locale, outcome.code, outcome.message)],
  };
}
