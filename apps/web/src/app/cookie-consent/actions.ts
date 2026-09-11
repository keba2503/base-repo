"use server";

import { cookies } from "next/headers";
import { recordConsentDecision, type ConsentDecision } from "@/main/privacy";
import { trackServerEvent } from "@/main/analytics";

const visitorCookieName = "visitor_id";
const visitorCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export async function submitConsentDecision(decision: ConsentDecision): Promise<void> {
  const validated = validateConsentDecision(decision);
  const store = await cookies();
  const visitorId = await recordConsentDecision(store.get(visitorCookieName)?.value, validated);
  store.set(visitorCookieName, visitorId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: visitorCookieMaxAgeSeconds,
    path: "/",
  });
  await trackServerEvent(visitorId, "consent_updated", {
    functional: validated.functional,
    analytics: validated.analytics,
    marketing: validated.marketing,
  });
}

function validateConsentDecision(decision: ConsentDecision): ConsentDecision {
  return {
    functional: decision.functional === true,
    analytics: decision.analytics === true,
    marketing: decision.marketing === true,
  };
}
