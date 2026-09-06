import type { DomainError, Email, EntityId, Result } from "@base/domain";

export type VerifiedSession = {
  readonly subjectId: EntityId;
  readonly email: Email;
};

export type VerifySessionRequest = {
  readonly token: string;
};

export type IdentityProvider = {
  verifySession(request: VerifySessionRequest): Promise<Result<VerifiedSession, DomainError>>;
};
