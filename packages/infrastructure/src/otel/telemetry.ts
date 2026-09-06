import { SpanStatusCode, type Tracer } from "@opentelemetry/api";
import type { Span, SpanAttributes, SpanStatus, Telemetry } from "@base/application";
import { redactedMarker, type RedactionPolicy } from "../memory/logger";

function redactedAttribute(
  policy: RedactionPolicy,
  name: string,
  value: string | number | boolean,
): string | number | boolean {
  const classification = policy[name];
  if (classification !== undefined && classification !== "none") return redactedMarker;
  return value;
}

function statusCodeOf(status: SpanStatus): SpanStatusCode {
  return status === "error" ? SpanStatusCode.ERROR : SpanStatusCode.OK;
}

export type OtelTelemetryOptions = {
  readonly policy?: RedactionPolicy;
};

export class OtelTelemetry implements Telemetry {
  readonly #tracer: Tracer;
  readonly #policy: RedactionPolicy;

  constructor(tracer: Tracer, options: OtelTelemetryOptions = {}) {
    this.#tracer = tracer;
    this.#policy = options.policy ?? {};
  }

  startSpan(name: string, attributes: SpanAttributes = {}): Span {
    const span = this.#tracer.startSpan(name);
    for (const [attributeName, value] of Object.entries(attributes)) {
      span.setAttribute(attributeName, redactedAttribute(this.#policy, attributeName, value));
    }
    return {
      setAttribute: (attributeName, value) => {
        span.setAttribute(attributeName, redactedAttribute(this.#policy, attributeName, value));
      },
      recordException: (error) => {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      },
      end: (status) => {
        if (status !== undefined) span.setStatus({ code: statusCodeOf(status) });
        span.end();
      },
    };
  }
}
