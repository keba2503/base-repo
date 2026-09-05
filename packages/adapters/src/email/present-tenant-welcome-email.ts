import type { TenantResponse } from "@base/application";
import type { EmailViewModel } from "./email-view-model";

export type PresentTenantWelcomeEmailInput = {
  readonly response: TenantResponse;
  readonly locale: string;
  readonly appUrl: string;
};

type WelcomeFacts = {
  readonly name: string;
  readonly slug: string;
  readonly createdAtLabel: string;
};

type WelcomeCopy = Pick<EmailViewModel, "subject" | "headline" | "paragraphs" | "actionLabel">;

type CopyWriter = (facts: WelcomeFacts) => WelcomeCopy;

const englishCopy: CopyWriter = ({ name, slug, createdAtLabel }) => ({
  subject: `${name} is created`,
  headline: `${name} is ready.`,
  paragraphs: [`Identifier: ${slug}.`, `Created on ${createdAtLabel}.`],
  actionLabel: `Open ${name}`,
});

const spanishCopy: CopyWriter = ({ name, slug, createdAtLabel }) => ({
  subject: `${name} está creada`,
  headline: `${name} está lista.`,
  paragraphs: [`Identificador: ${slug}.`, `Creada el ${createdAtLabel}.`],
  actionLabel: `Abrir ${name}`,
});

const copyByLanguage: Readonly<Record<string, CopyWriter>> = { en: englishCopy, es: spanishCopy };

const fallbackLanguage = "en";

function languageOf(locale: string): string {
  const language = locale.split("-")[0] ?? fallbackLanguage;
  return language in copyByLanguage ? language : fallbackLanguage;
}

function tenantUrl(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, "")}/tenants/${encodeURIComponent(slug)}`;
}

export function presentTenantWelcomeEmail(input: PresentTenantWelcomeEmailInput): EmailViewModel {
  const { response, locale, appUrl } = input;
  const language = languageOf(locale);
  const write = copyByLanguage[language] ?? englishCopy;
  const createdAtLabel = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    response.createdAt,
  );

  return {
    language,
    ...write({ name: response.name, slug: response.slug, createdAtLabel }),
    actionUrl: tenantUrl(appUrl, response.slug),
  };
}
