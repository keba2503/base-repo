import type { Actor } from "../kernel/actor";
import type { TenantResponse } from "../tenants/models";

export type MailMessage = {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly tags?: Readonly<Record<string, string>>;
};

export type DispatchOutboxRequest = {
  readonly actor: Actor;
  readonly limit: number;
  readonly maxAttempts: number;
};

export type DispatchOutboxResponse = {
  readonly pulled: number;
  readonly published: number;
  readonly failed: number;
  readonly unhandled: number;
  readonly abandoned: number;
};

export type TenantWelcomeMessageFactory = (response: TenantResponse) => MailMessage;

export const outboxResource = "outbox";
export const dispatchOutboxAction = "outbox:dispatch";

export const mailMessageInvalidCode = "mail.message.invalid";
export const mailProviderUnavailableCode = "mail.provider.unavailable";
