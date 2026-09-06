import type { Actor, CreateDocumentUpload, CreateDocumentUploadResponse } from "@base/application";
import { createDocumentUploadContract, parseContractInput } from "@base/contracts";
import { isErr } from "@base/domain";
import { failed, invalid, succeeded, type Outcome } from "../kernel/outcome";

export type CreateDocumentUploadCommand = {
  readonly actor: Actor;
  readonly payload: unknown;
};

export type CreateDocumentUploadController = (
  command: CreateDocumentUploadCommand,
) => Promise<Outcome<CreateDocumentUploadResponse>>;

export function createDocumentUploadController(useCase: CreateDocumentUpload): CreateDocumentUploadController {
  return async (command) => {
    const parsed = parseContractInput(createDocumentUploadContract, command.payload);
    if (parsed.kind === "invalid") return invalid(parsed.issues);

    const result = await useCase({ actor: command.actor });
    if (isErr(result)) return failed(result.error);

    return succeeded(result.value);
  };
}
