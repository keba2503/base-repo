"use server";

import { cookies } from "next/headers";
import { recordConsentDecision, type ConsentDecision } from "@/main/privacy";
import { trackServerEvent } from "@/main/analytics";

const visitorCookieName = "visitor_id";
const visitorCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export async function submitConsentDecision(decision: ConsentDecision): Promise<void> {
  const store = await cookies();
  const visitorId = await recordConsentDecision(store.get(visitorCookieName)?.value, decision);
  store.set(visitorCookieName, visitorId, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    maxAge: visitorCookieMaxAgeSeconds,
    path: "/",
  });
  await trackServerEvent(visitorId, "consent_updated", {
    functional: decision.functional,
    analytics: decision.analytics,
    marketing: decision.marketing,
  });
}
