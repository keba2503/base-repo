import { describe, expect, it } from "bun:test";
import type { Analytics } from "@base/application";

export function describeAnalyticsContract(name: string, createAnalytics: () => Analytics): void {
  describe(`${name} satisfies the Analytics contract`, () => {
    it("tracks an event without params", async () => {
      const analytics = createAnalytics();
      let raised: unknown;
      try {
        await analytics.track({ name: "page_view", clientId: "visitor-1" });
      } catch (error: unknown) {
        raised = error;
      }
      expect(raised).toBeUndefined();
    });

    it("tracks an event with params", async () => {
      const analytics = createAnalytics();
      let raised: unknown;
      try {
        await analytics.track({ name: "consent_updated", clientId: "visitor-1", params: { analytics: true } });
      } catch (error: unknown) {
        raised = error;
      }
      expect(raised).toBeUndefined();
    });
  });
}
