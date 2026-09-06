import type { Actor, ApiKeyCreatedResponse, CreateApiKey } from "@base/application";
import { createApiKeyContract, parseContractInput } from "@base/contracts";
import { isErr } from "@base/domain";
import { failed, invalid, succeeded, type Outcome } from "../kernel/outcome";

export type CreateApiKeyCommand = {
  readonly actor: Actor;
  readonly payload: unknown;
};

export type CreateApiKeyController = (command: CreateApiKeyCommand) => Promise<Outcome<ApiKeyCreatedResponse>>;

export function createApiKeyController(useCase: CreateApiKey): CreateApiKeyController {
  return async (command) => {
    const parsed = parseContractInput(createApiKeyContract, command.payload);
    if (parsed.kind === "invalid") return invalid(parsed.issues);

    const result = await useCase({
      actor: command.actor,
      name: parsed.input.name,
      scopes: parsed.input.scopes,
    });
    if (isErr(result)) return failed(result.error);

    return succeeded(result.value);
  };
}
