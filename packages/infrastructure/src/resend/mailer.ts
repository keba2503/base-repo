import {
  mailMessageInvalidCode,
  mailProviderUnavailableCode,
  type Mailer,
  type MailMessage,
} from "@base/application";
import { err, invariantViolation, ok, unavailable, type DomainError, type Result } from "@base/domain";
import type { CreateEmailOptions, CreateEmailRequestOptions, CreateEmailResponse, ErrorResponse, Tag } from "resend";

export type ResendEmailClient = {
  readonly emails: {
    send(payload: CreateEmailOptions, options?: CreateEmailRequestOptions): Promise<CreateEmailResponse>;
  };
};

export type ResendMailerOptions = {
  readonly client: ResendEmailClient;
  readonly from: string;
  readonly timeoutMs: number;
};

const messageProblemNames: ReadonlySet<ErrorResponse["name"]> = new Set<ErrorResponse["name"]>([
  "validation_error",
  "invalid_parameter",
  "missing_required_field",
  "invalid_attachment",
  "invalid_from_address",
]);

function tagsOf(tags: Readonly<Record<string, string>>): Tag[] {
  return Object.entries(tags).map(([name, value]) => ({ name, value }));
}

function payloadOf(from: string, message: MailMessage): CreateEmailOptions {
  const base: CreateEmailOptions = {
    from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
  return message.tags ? { ...base, tags: tagsOf(message.tags) } : base;
}

function translate(error: ErrorResponse): DomainError {
  if (messageProblemNames.has(error.name)) {
    return invariantViolation(mailMessageInvalidCode, `Resend rejected the message: ${error.name}`);
  }
  return unavailable(mailProviderUnavailableCode, `Resend could not send the message: ${error.name}`);
}

function withTimeout<Value>(pending: Promise<Value>, timeoutMs: number): Promise<Value> {
  return new Promise<Value>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Resend did not answer within ${String(timeoutMs)}ms`));
    }, timeoutMs);
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (failure: unknown) => {
        clearTimeout(timer);
        reject(failure instanceof Error ? failure : new Error(String(failure)));
      },
    );
  });
}

export class ResendMailer implements Mailer {
  readonly #client: ResendEmailClient;
  readonly #from: string;
  readonly #timeoutMs: number;

  constructor(options: ResendMailerOptions) {
    this.#client = options.client;
    this.#from = options.from;
    this.#timeoutMs = options.timeoutMs;
  }

  async send(message: MailMessage): Promise<Result<void, DomainError>> {
    let response: CreateEmailResponse;
    try {
      response = await withTimeout(this.#client.emails.send(payloadOf(this.#from, message)), this.#timeoutMs);
    } catch {
      return err(unavailable(mailProviderUnavailableCode, "the mail provider could not be reached"));
    }
    if (response.error) return err(translate(response.error));
    return ok(undefined);
  }
}
