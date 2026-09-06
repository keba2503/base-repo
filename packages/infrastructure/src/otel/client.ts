import { NodeTracerProvider, BatchSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { Tracer } from "@opentelemetry/api";
import type { OtlpEndpoint } from "./sentry-endpoint";

export type OtelClient = {
  readonly tracer: Tracer;
  shutdown(): Promise<void>;
};

export type OtelClientOptions = {
  readonly serviceName: string;
  readonly endpoint: OtlpEndpoint;
};

function otlpExporterFor(endpoint: OtlpEndpoint): SpanExporter {
  return new OTLPTraceExporter({ url: endpoint.url, headers: endpoint.headers });
}

export function createOtelClient(options: OtelClientOptions): OtelClient {
  return createOtelClientWithExporter(options.serviceName, otlpExporterFor(options.endpoint));
}

export function createOtelClientWithExporter(serviceName: string, exporter: SpanExporter): OtelClient {
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": serviceName }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  return {
    tracer: provider.getTracer(serviceName),
    shutdown: () => provider.shutdown(),
  };
}
