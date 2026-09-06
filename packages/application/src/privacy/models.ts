import type { ConsentCategory, EntityId } from "@base/domain";
import type { Actor } from "../kernel/actor";

export const consentResource = "consent";
export const grantConsentAction = "consent:grant";
export const withdrawConsentAction = "consent:withdraw";
export const readConsentAction = "consent:read";

export const privacyResource = "privacy";
export const requestDataExportAction = "privacy:export";
export const requestErasureAction = "privacy:erasure";

export type GrantConsentRequest = {
  readonly actor: Actor;
  readonly subjectId: EntityId;
  readonly category: ConsentCategory;
  readonly policyVersion: string;
  readonly sourceIpAddress: string;
  readonly sourceUserAgent: string;
};

export type WithdrawConsentRequest = {
  readonly actor: Actor;
  readonly subjectId: EntityId;
  readonly category: ConsentCategory;
};

export type HasActiveConsentRequest = {
  readonly actor: Actor;
  readonly subjectId: EntityId;
  readonly category: ConsentCategory;
  readonly policyVersion: string;
};

export type ConsentResponse = {
  readonly id: string;
  readonly subjectId: string;
  readonly category: ConsentCategory;
  readonly policyVersion: string;
  readonly grantedAt: Date;
  readonly withdrawnAt: Date | null;
};

export type HasActiveConsentResponse = {
  readonly covered: boolean;
};

export type RequestDataExportRequest = {
  readonly actor: Actor;
  readonly subjectId: EntityId;
};

export type RequestErasureRequest = {
  readonly actor: Actor;
  readonly subjectId: EntityId;
};

export type PrivacyJobAcceptedResponse = {
  readonly accepted: true;
};
