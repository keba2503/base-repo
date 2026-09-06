import { mailMessageInvalidCode, type Mailer, type MailMessage } from "@base/application";
import { err, invariantViolation, ok, type DomainError, type Result } from "@base/domain";

const recipientPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function malformedRecipient(to: string): DomainError | undefined {
  if (recipientPattern.test(to)) return undefined;
  return invariantViolation(mailMessageInvalidCode, "The recipient is not a well formed email address");
}

export class InMemoryMailer implements Mailer {
  readonly #sent: MailMessage[] = [];

  send(message: MailMessage): Promise<Result<void, DomainError>> {
    const malformed = malformedRecipient(message.to);
    if (malformed) return Promise.resolve(err(malformed));
    this.#sent.push(message);
    return Promise.resolve(ok(undefined));
  }

  get sent(): readonly MailMessage[] {
    return [...this.#sent];
  }

  drain(): readonly MailMessage[] {
    const drained = [...this.#sent];
    this.#sent.length = 0;
    return drained;
  }
}

export type ConsoleMailerOptions = {
  readonly sink?: (line: string) => void;
};

export class ConsoleMailer implements Mailer {
  readonly #sink: (line: string) => void;

  constructor(options: ConsoleMailerOptions = {}) {
    this.#sink = options.sink ?? ((line) => { console.info(line); });
  }

  send(message: MailMessage): Promise<Result<void, DomainError>> {
    const malformed = malformedRecipient(message.to);
    if (malformed) return Promise.resolve(err(malformed));
    this.#sink(`mail to ${message.to} | ${message.subject}\n${message.text}`);
    return Promise.resolve(ok(undefined));
  }
}
