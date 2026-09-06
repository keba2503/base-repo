export type SpanAttributes = Readonly<Record<string, string | number | boolean>>;

export type SpanStatus = "ok" | "error";

export type Span = {
  setAttribute(name: string, value: string | number | boolean): void;
  recordException(error: Error): void;
  end(status?: SpanStatus): void;
};

export type Telemetry = {
  startSpan(name: string, attributes?: SpanAttributes): Span;
};
