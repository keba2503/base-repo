import type { ContractAuth } from "@base/contracts";
import type { ActorResolver, Actor, Credential } from "./dependencies";
import { failure, type ApiFailure } from "./failure";
import { fingerprintOf } from "./fingerprint";

const bearerPrefix = /^Bearer\s+(.+)$/i;

export function credentialOf(request: Request, remoteAddress: string): Credential {
  const authorization = request.headers.get("authorization")?.trim();
  const bearer = authorization === undefined ? null : bearerPrefix.exec(authorization);
  const secret = bearer?.[1]?.trim();
  if (secret !== undefined && secret.length > 0) return { kind: "apiKey", secret };

  const cookieHeader = request.headers.get("cookie")?.trim();
  if (cookieHeader !== undefined && cookieHeader.length > 0) return { kind: "session", cookieHeader };

  return { kind: "anonymous", remoteAddress };
}

export async function rateLimitSubjectOf(credential: Credential): Promise<string> {
  if (credential.kind === "anonymous") return `address:${credential.remoteAddress}`;
  const material = credential.kind === "apiKey" ? credential.secret : credential.cookieHeader;
  return `${credential.kind}:${(await fingerprintOf(material)).slice(0, 32)}`;
}

function accepts(auth: ContractAuth, credential: Credential): boolean {
  if (auth === "public") return true;
  if (credential.kind === "anonymous") return false;
  if (auth === "either") return true;
  return auth === credential.kind;
}

export type Authentication =
  | { readonly kind: "authenticated"; readonly actor: Actor }
  | { readonly kind: "refused"; readonly reason: ApiFailure };

export async function authenticate(request: {
  readonly auth: ContractAuth;
  readonly credential: Credential;
  readonly resolveActor: ActorResolver;
}): Promise<Authentication> {
  const { auth, credential, resolveActor } = request;

  if (auth !== "public" && credential.kind === "anonymous") {
    return { kind: "refused", reason: failure(401, "auth.required", "This operation requires credentials") };
  }
  if (!accepts(auth, credential)) {
    return {
      kind: "refused",
      reason: failure(401, "auth.credentialNotAccepted", `This operation accepts ${auth} credentials only`),
    };
  }

  const actor = await resolveActor(credential);
  if (actor === undefined) {
    return { kind: "refused", reason: failure(401, "auth.invalid", "The credentials were not recognised") };
  }
  return { kind: "authenticated", actor };
}
