import type { Actor, ConfirmDocumentUpload, DocumentResponse } from "@base/application";
import { confirmDocumentUploadContract, parseContractInput } from "@base/contracts";
import { isErr } from "@base/domain";
import { failed, invalid, succeeded, type Outcome } from "../kernel/outcome";

export type ConfirmDocumentUploadCommand = {
  readonly actor: Actor;
  readonly payload: unknown;
};

export type ConfirmDocumentUploadController = (
  command: ConfirmDocumentUploadCommand,
) => Promise<Outcome<DocumentResponse>>;

export function confirmDocumentUploadController(useCase: ConfirmDocumentUpload): ConfirmDocumentUploadController {
  return async (command) => {
    const parsed = parseContractInput(confirmDocumentUploadContract, command.payload);
    if (parsed.kind === "invalid") return invalid(parsed.issues);

    const result = await useCase({
      actor: command.actor,
      storageKey: parsed.input.storageKey,
      filename: parsed.input.filename,
    });
    if (isErr(result)) return failed(result.error);

    return succeeded(result.value);
  };
}
