import type { Actor, ApiKeyResponse, RevokeApiKey } from "@base/application";
import { parseContractInput, revokeApiKeyContract } from "@base/contracts";
import { isErr } from "@base/domain";
import { failed, invalid, succeeded, type Outcome } from "../kernel/outcome";

export type RevokeApiKeyCommand = {
  readonly actor: Actor;
  readonly payload: unknown;
};

export type RevokeApiKeyController = (command: RevokeApiKeyCommand) => Promise<Outcome<ApiKeyResponse>>;

export function revokeApiKeyController(useCase: RevokeApiKey): RevokeApiKeyController {
  return async (command) => {
    const parsed = parseContractInput(revokeApiKeyContract, command.payload);
    if (parsed.kind === "invalid") return invalid(parsed.issues);

    const result = await useCase({ actor: command.actor, apiKeyId: parsed.input.apiKeyId });
    if (isErr(result)) return failed(result.error);

    return succeeded(result.value);
  };
}
