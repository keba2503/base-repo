export { dispatchOutbox, type DispatchOutbox, type DispatchOutboxDependencies } from "./dispatch-outbox";
export type { EventHandler } from "./event-handler";
export { handlerRegistry, type HandlerRegistry } from "./handler-registry";
export {
  dispatchOutboxAction,
  mailMessageInvalidCode,
  mailProviderUnavailableCode,
  outboxResource,
  type DispatchOutboxRequest,
  type DispatchOutboxResponse,
  type MailMessage,
  type TenantWelcomeMessageFactory,
} from "./models";
export type { Mailer } from "./ports/mailer";
export {
  sendTenantWelcome,
  tenantCreatedEventName,
  type SendTenantWelcomeDependencies,
} from "./send-tenant-welcome";
