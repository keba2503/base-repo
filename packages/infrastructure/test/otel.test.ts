import { describe, expect, it } from "bun:test";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { OtelTelemetry, redactedMarker, sentryOtlpEndpointFrom } from "@base/infrastructure";
import { describeTelemetryContract } from "./contracts/index";

function otelHarness(policy: Readonly<Record<string, "none" | "personal" | "sensitive">> = {}) {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const tracer = provider.getTracer("test");
  return { telemetry: new OtelTelemetry(tracer, { policy }), exporter };
}

describeTelemetryContract("OtelTelemetry", () => otelHarness().telemetry);

describe("OtelTelemetry", () => {
  it("exports a real span with its attributes", () => {
    const { telemetry, exporter } = otelHarness();
    const span = telemetry.startSpan("http.request", { requestId: "req-1", tenantId: "tenant-1" });
    span.end("ok");
    const [exported] = exporter.getFinishedSpans();
    expect(exported?.name).toBe("http.request");
    expect(exported?.attributes).toEqual({ requestId: "req-1", tenantId: "tenant-1" });
  });

  it("redacts an attribute classified as personal before it reaches the exporter", () => {
    const { telemetry, exporter } = otelHarness({ subjectId: "personal" });
    const span = telemetry.startSpan("http.request", { subjectId: "user-1" });
    span.setAttribute("tenantId", "tenant-1");
    span.end();
    const [exported] = exporter.getFinishedSpans();
    expect(exported?.attributes).toEqual({ subjectId: redactedMarker, tenantId: "tenant-1" });
  });

  it("records an exception on the underlying span", () => {
    const { telemetry, exporter } = otelHarness();
    const span = telemetry.startSpan("job.execute");
    span.recordException(new Error("boom"));
    span.end();
    const [exported] = exporter.getFinishedSpans();
    expect(exported?.events).toHaveLength(1);
    expect(exported?.events[0]?.name).toBe("exception");
  });
});

describe("sentryOtlpEndpointFrom", () => {
  it("builds the OTLP traces endpoint and auth header from a Sentry DSN", () => {
    const endpoint = sentryOtlpEndpointFrom("https://examplePublicKey@o123456.ingest.sentry.io/4567");
    expect(endpoint.url).toBe("https://o123456.ingest.sentry.io/api/4567/otlp/v1/traces");
    expect(endpoint.headers["x-sentry-auth"]).toBe("sentry sentry_version=7, sentry_key=examplePublicKey");
  });

  it("keeps a self hosted path prefix before the project id", () => {
    const endpoint = sentryOtlpEndpointFrom("https://key@sentry.example.com/self-hosted/9");
    expect(endpoint.url).toBe("https://sentry.example.com/self-hosted/api/9/otlp/v1/traces");
  });

  it("rejects a DSN without a public key", () => {
    expect(() => sentryOtlpEndpointFrom("https://o123456.ingest.sentry.io/4567")).toThrow();
  });
});
