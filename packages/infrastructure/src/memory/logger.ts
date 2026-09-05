import type { LogFields, Logger } from "@base/application";
import type { FieldClassification } from "@base/domain";

export type RedactionPolicy = Readonly<Record<string, FieldClassification>>;

export type LogLevel = "info" | "warn" | "error";

export type LogSink = {
  info(message: string, fields: LogFields): void;
  warn(message: string, fields: LogFields): void;
  error(message: string, fields: LogFields): void;
};

export const redactedMarker = "[redacted]";

export function redact(policy: RedactionPolicy, fields: LogFields): LogFields {
  const redacted: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields)) {
    redacted[name] = policy[name] === undefined || policy[name] === "none" ? value : redactedMarker;
  }
  return redacted;
}

const consoleSink: LogSink = {
  info(message, fields) {
    console.info(message, fields);
  },
  warn(message, fields) {
    console.warn(message, fields);
  },
  error(message, fields) {
    console.error(message, fields);
  },
};

export type ConsoleLoggerOptions = {
  readonly policy?: RedactionPolicy;
  readonly sink?: LogSink;
};

export class ConsoleLogger implements Logger {
  readonly #policy: RedactionPolicy;
  readonly #sink: LogSink;

  constructor(options: ConsoleLoggerOptions = {}) {
    this.#policy = options.policy ?? {};
    this.#sink = options.sink ?? consoleSink;
  }

  info(message: string, fields: LogFields = {}): void {
    this.#sink.info(message, redact(this.#policy, fields));
  }

  warn(message: string, fields: LogFields = {}): void {
    this.#sink.warn(message, redact(this.#policy, fields));
  }

  error(message: string, fields: LogFields = {}): void {
    this.#sink.error(message, redact(this.#policy, fields));
  }
}

export class SilentLogger implements Logger {
  info(): void {
    return undefined;
  }

  warn(): void {
    return undefined;
  }

  error(): void {
    return undefined;
  }
}
