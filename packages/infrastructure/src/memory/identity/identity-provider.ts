import type { IdentityProvider, VerifiedSession, VerifySessionRequest } from "@base/application";
import { err, forbidden, ok, type DomainError, type Result } from "@base/domain";

export const invalidSessionError: DomainError = forbidden(
  "identity.session.invalid",
  "This session token is not valid",
);

export class InMemoryIdentityProvider implements IdentityProvider {
  readonly #sessions = new Map<string, VerifiedSession>();
  #issued = 0;

  issue(session: VerifiedSession): string {
    this.#issued += 1;
    const token = `session-${String(this.#issued)}-${session.subjectId}`;
    this.#sessions.set(token, session);
    return token;
  }

  revoke(token: string): void {
    this.#sessions.delete(token);
  }

  verifySession(request: VerifySessionRequest): Promise<Result<VerifiedSession, DomainError>> {
    const session = this.#sessions.get(request.token);
    return Promise.resolve(session ? ok(session) : err(invalidSessionError));
  }
}
