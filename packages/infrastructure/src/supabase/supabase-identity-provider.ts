import type { IdentityProvider, VerifiedSession, VerifySessionRequest } from "@base/application";
import { err, forbidden, isOk, ok, parseEmail, parseEntityId, type DomainError, type Result } from "@base/domain";
import { isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseSessionClient = {
  readonly auth: Pick<SupabaseClient["auth"], "getUser">;
};

export type SupabaseIdentityProviderOptions = {
  readonly client: SupabaseSessionClient;
  readonly timeoutMilliseconds?: number;
};

export const supabaseVerifyTimeoutMilliseconds = 5000;

const invalidSession = forbidden("identity.session.invalid", "This session token is not valid");
const sessionWithoutEmail = forbidden("identity.session.noEmail", "This session carries no email");

function withTimeout<Value>(work: Promise<Value>, milliseconds: number): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Supabase did not answer within ${String(milliseconds)} ms`));
    }, milliseconds);
  });
  return Promise.race([work, expiry]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export class SupabaseIdentityProvider implements IdentityProvider {
  readonly #client: SupabaseSessionClient;
  readonly #timeoutMilliseconds: number;

  constructor(options: SupabaseIdentityProviderOptions) {
    this.#client = options.client;
    this.#timeoutMilliseconds = options.timeoutMilliseconds ?? supabaseVerifyTimeoutMilliseconds;
  }

  async verifySession(request: VerifySessionRequest): Promise<Result<VerifiedSession, DomainError>> {
    if (request.token.length === 0) return err(invalidSession);

    const response = await withTimeout(this.#client.auth.getUser(request.token), this.#timeoutMilliseconds);
    if (response.error) {
      if (isAuthRetryableFetchError(response.error)) {
        throw new Error(`Supabase could not be reached to verify a session: ${response.error.message}`);
      }
      return err(invalidSession);
    }

    const subjectId = parseEntityId(response.data.user.id);
    if (!isOk(subjectId)) return err(invalidSession);

    if (response.data.user.email === undefined) return err(sessionWithoutEmail);
    const email = parseEmail(response.data.user.email);
    if (!isOk(email)) return err(sessionWithoutEmail);

    return ok({ subjectId: subjectId.value, email: email.value });
  }
}
