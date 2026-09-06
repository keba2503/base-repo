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

const classificationRank: Readonly<Record<FieldClassification, number>> = {
  none: 0,
  personal: 1,
  sensitive: 2,
};

function mostRestrictive(a: FieldClassification, b: FieldClassification): FieldClassification {
  return classificationRank[a] >= classificationRank[b] ? a : b;
}

export function redactionPolicyFrom(
  ...classifications: readonly Readonly<Record<string, FieldClassification>>[]
): RedactionPolicy {
  const merged: Record<string, FieldClassification> = {};
  for (const classification of classifications) {
    for (const [field, level] of Object.entries(classification)) {
      const existing = merged[field];
      merged[field] = existing === undefined ? level : mostRestrictive(existing, level);
    }
  }
  return merged;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactAny(policy: RedactionPolicy, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => redactAny(policy, item));
  if (isPlainObject(value)) return redactDeep(policy, value);
  return value;
}

function redactValue(policy: RedactionPolicy, name: string, value: unknown): unknown {
  const classification = policy[name];
  if (classification !== undefined && classification !== "none") return redactedMarker;
  return redactAny(policy, value);
}

function redactDeep(policy: RedactionPolicy, fields: LogFields): LogFields {
  const redacted: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields)) {
    redacted[name] = redactValue(policy, name, value);
  }
  return redacted;
}

export function redact(policy: RedactionPolicy, fields: LogFields): LogFields {
  return redactDeep(policy, fields);
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
