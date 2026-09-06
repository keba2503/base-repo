import { describe, expect, it } from "bun:test";
import type { Telemetry } from "@base/application";

export function describeTelemetryContract(name: string, createTelemetry: () => Telemetry): void {
  describe(`${name} satisfies the Telemetry contract`, () => {
    it("starts and ends a span without attributes", () => {
      const telemetry = createTelemetry();
      expect(() => {
        const span = telemetry.startSpan("test.span");
        span.end();
      }).not.toThrow();
    });

    it("starts a span with attributes and lets more be added before ending", () => {
      const telemetry = createTelemetry();
      expect(() => {
        const span = telemetry.startSpan("test.span", { tenantId: "tenant-1", requestId: "req-1" });
        span.setAttribute("attempt", 1);
        span.end("ok");
      }).not.toThrow();
    });

    it("records an exception and still allows ending the span", () => {
      const telemetry = createTelemetry();
      expect(() => {
        const span = telemetry.startSpan("test.span");
        span.recordException(new Error("boom"));
        span.end("error");
      }).not.toThrow();
    });

    it("tolerates ending the same span twice", () => {
      const telemetry = createTelemetry();
      const span = telemetry.startSpan("test.span");
      span.end();
      expect(() => {
        span.end();
      }).not.toThrow();
    });
  });
}
