import type { ApiKeyResponse } from "@base/application";
import { dateLabel, scopeLabels, translateIdentity } from "./messages";

export type ApiKeyViewModel = {
  readonly id: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly scopeLabels: readonly string[];
  readonly createdAtLabel: string;
  readonly isRevoked: boolean;
  readonly statusLabel: string;
};

export function presentApiKey(response: ApiKeyResponse, locale: string): ApiKeyViewModel {
  const isRevoked = response.revokedAt !== null;
  const statusLabel =
    response.revokedAt === null
      ? translateIdentity(locale, "apiKey.status.active", "Active")
      : `${translateIdentity(locale, "apiKey.status.revoked", "Revoked")} · ${dateLabel(locale, response.revokedAt)}`;

  return {
    id: response.id,
    name: response.name,
    keyPrefix: response.keyPrefix,
    scopeLabels: scopeLabels(locale, response.scopes),
    createdAtLabel: dateLabel(locale, response.createdAt),
    isRevoked,
    statusLabel,
  };
}
