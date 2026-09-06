import "server-only";
import { isErr, type ConsentCategory } from "@base/domain";
import { headers } from "next/headers";
import { visitorActorFor } from "./actor";
import { grantConsentOperation, hasActiveConsentOperation, withdrawConsentOperation } from "./use-cases";

export const consentPolicyVersion = "2026-09-06";
export const consentCategoryNames = ["functional", "analytics", "marketing"] as const;

export type ConsentCategoryName = (typeof consentCategoryNames)[number];
export type ConsentDecision = Readonly<Record<ConsentCategoryName, boolean>>;

const unknownStatus: ConsentDecision = { functional: false, analytics: false, marketing: false };

export type ConsentStatusResult = {
  readonly visitorId: string;
  readonly status: ConsentDecision;
  readonly known: boolean;
};

export async function readConsentStatus(visitorId: string | undefined): Promise<ConsentStatusResult> {
  if (visitorId === undefined) {
    return { visitorId: visitorActorFor(undefined).visitorId, status: unknownStatus, known: false };
  }
  const { actor, visitorId: resolvedVisitorId } = visitorActorFor(visitorId);
  const check = hasActiveConsentOperation();
  const entries = await Promise.all(
    consentCategoryNames.map(async (category) => {
      const result = await check({
        actor,
        subjectId: actor.subjectId,
        category: category as ConsentCategory,
        policyVersion: consentPolicyVersion,
      });
      return [category, isErr(result) ? false : result.value.covered] as const;
    }),
  );
  return { visitorId: resolvedVisitorId, status: Object.fromEntries(entries) as ConsentDecision, known: true };
}

async function requestSource(): Promise<{ ipAddress: string; userAgent: string }> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? "0.0.0.0",
    userAgent: requestHeaders.get("user-agent") ?? "unknown",
  };
}

export async function recordConsentDecision(
  visitorId: string | undefined,
  decision: ConsentDecision,
): Promise<string> {
  const { actor, visitorId: resolvedVisitorId } = visitorActorFor(visitorId);
  const grant = grantConsentOperation();
  const withdraw = withdrawConsentOperation();
  const source = await requestSource();

  for (const category of consentCategoryNames) {
    if (decision[category]) {
      await grant({
        actor,
        subjectId: actor.subjectId,
        category: category as ConsentCategory,
        policyVersion: consentPolicyVersion,
        sourceIpAddress: source.ipAddress,
        sourceUserAgent: source.userAgent,
      });
    } else {
      await withdraw({ actor, subjectId: actor.subjectId, category: category as ConsentCategory });
    }
  }

  return resolvedVisitorId;
}
