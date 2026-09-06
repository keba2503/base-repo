import { describe, expect, it } from "bun:test";
import { MeasurementProtocolAnalytics, type MeasurementProtocolFetch } from "@base/infrastructure";
import { describeAnalyticsContract } from "./contracts/index";

function okFetch(): MeasurementProtocolFetch {
  return () => Promise.resolve(new Response(null, { status: 204 }));
}

describeAnalyticsContract(
  "MeasurementProtocolAnalytics",
  () =>
    new MeasurementProtocolAnalytics({
      measurementId: "G-TEST",
      apiSecret: "secret",
      timeoutMilliseconds: 1_000,
      fetchImpl: okFetch(),
    }),
);

describe("MeasurementProtocolAnalytics", () => {
  it("posts the event to the measurement id and api secret it was configured with", async () => {
    const calls: { readonly url: string; readonly init: RequestInit }[] = [];
    const analytics = new MeasurementProtocolAnalytics({
      measurementId: "G-ABC123",
      apiSecret: "top-secret",
      timeoutMilliseconds: 1_000,
      fetchImpl: (url, init) => {
        calls.push({ url, init });
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });

    await analytics.track({ name: "consent_updated", clientId: "visitor-1", params: { analytics: true } });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("measurement_id=G-ABC123");
    expect(calls[0]?.url).toContain("api_secret=top-secret");
    const rawBody = calls[0]?.init.body;
    const body = JSON.parse(typeof rawBody === "string" ? rawBody : "") as {
      client_id: string;
      events: readonly { name: string; params: Record<string, unknown> }[];
    };
    expect(body).toEqual({
      client_id: "visitor-1",
      events: [{ name: "consent_updated", params: { analytics: true } }],
    });
  });

  it("raises when the provider answers with a failing status", async () => {
    const analytics = new MeasurementProtocolAnalytics({
      measurementId: "G-TEST",
      apiSecret: "secret",
      timeoutMilliseconds: 1_000,
      fetchImpl: () => Promise.resolve(new Response(null, { status: 500 })),
    });

    const attempt = analytics.track({ name: "page_view", clientId: "visitor-1" });
    const caught = await attempt.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(caught).toBeInstanceOf(Error);
  });

  it("raises once the provider takes longer than the configured timeout", async () => {
    const analytics = new MeasurementProtocolAnalytics({
      measurementId: "G-TEST",
      apiSecret: "secret",
      timeoutMilliseconds: 5,
      fetchImpl: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(new Response(null, { status: 204 }));
          }, 50);
        }),
    });

    const attempt = analytics.track({ name: "page_view", clientId: "visitor-1" });
    const caught = await attempt.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(caught).toBeInstanceOf(Error);
  });
});
