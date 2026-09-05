import type { Actor, CreateTenant, TenantResponse } from "@base/application";
import { createTenantContract, parseContractInput } from "@base/contracts";
import { isErr } from "@base/domain";
import { failed, invalid, succeeded, type Outcome } from "../kernel/outcome";

export type CreateTenantCommand = {
  readonly actor: Actor;
  readonly payload: unknown;
};

export type CreateTenantController = (command: CreateTenantCommand) => Promise<Outcome<TenantResponse>>;

export function createTenantController(useCase: CreateTenant): CreateTenantController {
  return async (command) => {
    const parsed = parseContractInput(createTenantContract, command.payload);
    if (parsed.kind === "invalid") return invalid(parsed.issues);

    const result = await useCase({
      actor: command.actor,
      name: parsed.input.name,
      slug: parsed.input.slug,
    });
    if (isErr(result)) return failed(result.error);

    return succeeded(result.value);
  };
}
