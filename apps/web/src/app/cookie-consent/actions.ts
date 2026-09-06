"use server";

import { cookies } from "next/headers";
import { recordConsentDecision, type ConsentDecision } from "@/main/privacy";

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
}
