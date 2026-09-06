import { failure, type ApiFailure } from "./failure";
import type { HumanVerifier, Logger } from "./ports";

export const humanTokenHeader = "X-Human-Token";

export async function verifyHuman(request: {
  readonly token: string | undefined;
  readonly remoteAddress: string;
  readonly verifier: HumanVerifier;
  readonly logger: Logger;
  readonly requestId: string;
}): Promise<ApiFailure | undefined> {
  const token = request.token?.trim() ?? "";
  if (token.length === 0) {
    return failure(422, "humanCheck.tokenMissing", `This operation requires a ${humanTokenHeader} header`);
  }

  const verification = await request.verifier.verify({ token, remoteAddress: request.remoteAddress });
  if (verification.kind === "human") return undefined;

  request.logger.warn("human check rejected", { requestId: request.requestId, reason: verification.reason });
  return failure(403, "humanCheck.rejected", "The human verification did not pass");
}
