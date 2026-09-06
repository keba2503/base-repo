import type { DomainError, Result } from "@base/domain";
import type { MailMessage } from "../models";

export type Mailer = {
  send(message: MailMessage): Promise<Result<void, DomainError>>;
};
