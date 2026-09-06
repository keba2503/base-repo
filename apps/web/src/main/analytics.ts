import "server-only";
import type { AnalyticsEventParams } from "@base/application";
import { readConsentStatus } from "./privacy";
import { sharedContainer } from "./use-cases";

export async function trackServerEvent(
  visitorId: string | undefined,
  name: string,
  params?: AnalyticsEventParams,
): Promise<void> {
  const { visitorId: resolvedVisitorId, status } = await readConsentStatus(visitorId);
  if (!status.analytics) return;

  const parts = sharedContainer();
  try {
    await parts.analytics.track(
      params === undefined ? { name, clientId: resolvedVisitorId } : { name, clientId: resolvedVisitorId, params },
    );
  } catch (error: unknown) {
    parts.logger.warn("failed to send a server side analytics event", {
      name,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
