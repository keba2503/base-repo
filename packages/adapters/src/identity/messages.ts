const messagesByLocale: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  es: {
    "apiKey.created.warning": "Copia esta clave ahora. No volverá a mostrarse.",
    "apiKey.created.keyLabel": "Clave",
    "apiKey.status.active": "Activa",
    "apiKey.status.revoked": "Revocada",
    "scope.tenants:create": "Crear organizaciones",
    "scope.tenants:read": "Leer organizaciones",
    "scope.apikeys:manage": "Gestionar claves de API",
    "scope.members:manage": "Gestionar miembros",
  },
  en: {
    "apiKey.created.warning": "Copy this key now. It will not be shown again.",
    "apiKey.created.keyLabel": "Key",
    "apiKey.status.active": "Active",
    "apiKey.status.revoked": "Revoked",
    "scope.tenants:create": "Create organisations",
    "scope.tenants:read": "Read organisations",
    "scope.apikeys:manage": "Manage API keys",
    "scope.members:manage": "Manage members",
  },
};

function languageOf(locale: string): string {
  return locale.split("-")[0] ?? "en";
}

export function translateIdentity(locale: string, key: string, fallback: string): string {
  const language = languageOf(locale);
  return messagesByLocale[language]?.[key] ?? messagesByLocale.en?.[key] ?? fallback;
}

export function scopeLabels(locale: string, scopes: readonly string[]): readonly string[] {
  return scopes.map((scope) => translateIdentity(locale, `scope.${scope}`, scope));
}

export function dateLabel(locale: string, instant: Date): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(instant);
}
