import type { Span, SpanAttributes, SpanStatus, Telemetry } from "@base/application";
import { redact, type RedactionPolicy } from "./logger";

export type RecordedSpan = {
  readonly name: string;
  readonly attributes: SpanAttributes;
  readonly exceptions: readonly Error[];
  readonly status: SpanStatus;
  readonly ended: boolean;
};

function buildSpan(
  name: string,
  initialAttributes: SpanAttributes,
  policy: RedactionPolicy,
  onEnd: (span: RecordedSpan) => void,
): Span {
  const attributes: Record<string, string | number | boolean> = { ...initialAttributes };
  const exceptions: Error[] = [];
  let status: SpanStatus = "ok";
  let ended = false;

  return {
    setAttribute(attributeName, value) {
      attributes[attributeName] = value;
    },
    recordException(error) {
      exceptions.push(error);
      status = "error";
    },
    end(finalStatus) {
      if (ended) return;
      ended = true;
      status = finalStatus ?? status;
      onEnd({
        name,
        attributes: redact(policy, attributes) as SpanAttributes,
        exceptions,
        status,
        ended,
      });
    },
  };
}

export type InMemoryTelemetryOptions = {
  readonly policy?: RedactionPolicy;
};

export class InMemoryTelemetry implements Telemetry {
  readonly #policy: RedactionPolicy;
  readonly #spans: RecordedSpan[] = [];

  constructor(options: InMemoryTelemetryOptions = {}) {
    this.#policy = options.policy ?? {};
  }

  startSpan(name: string, attributes: SpanAttributes = {}): Span {
    return buildSpan(name, attributes, this.#policy, (span) => {
      this.#spans.push(span);
    });
  }

  get spans(): readonly RecordedSpan[] {
    return this.#spans;
  }
}

export class NoopTelemetry implements Telemetry {
  startSpan(): Span {
    return {
      setAttribute: () => undefined,
      recordException: () => undefined,
      end: () => undefined,
    };
  }
}
