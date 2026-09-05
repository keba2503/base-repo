import type { ApiKeyCreatedResponse } from "@base/application";
import { dateLabel, scopeLabels, translateIdentity } from "./messages";

export type ApiKeyCreatedViewModel = {
  readonly id: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly plaintextKey: string;
  readonly keyLabel: string;
  readonly warningLabel: string;
  readonly scopeLabels: readonly string[];
  readonly createdAtLabel: string;
};

export function presentApiKeyCreated(response: ApiKeyCreatedResponse, locale: string): ApiKeyCreatedViewModel {
  return {
    id: response.id,
    name: response.name,
    keyPrefix: response.keyPrefix,
    plaintextKey: response.plaintextKey,
    keyLabel: translateIdentity(locale, "apiKey.created.keyLabel", "Key"),
    warningLabel: translateIdentity(
      locale,
      "apiKey.created.warning",
      "Copy this key now. It will not be shown again.",
    ),
    scopeLabels: scopeLabels(locale, response.scopes),
    createdAtLabel: dateLabel(locale, response.createdAt),
  };
}
