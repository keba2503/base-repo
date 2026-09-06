import type { Actor, DocumentResponse, UploadDocument } from "@base/application";
import { parseContractInput, uploadDocumentContract } from "@base/contracts";
import { isErr } from "@base/domain";
import { failed, invalid, succeeded, type Outcome } from "../kernel/outcome";

export type UploadDocumentCommand = {
  readonly actor: Actor;
  readonly payload: unknown;
};

export type UploadDocumentController = (command: UploadDocumentCommand) => Promise<Outcome<DocumentResponse>>;

export function uploadDocumentController(useCase: UploadDocument): UploadDocumentController {
  return async (command) => {
    const parsed = parseContractInput(uploadDocumentContract, command.payload);
    if (parsed.kind === "invalid") return invalid(parsed.issues);

    const result = await useCase({
      actor: command.actor,
      filename: parsed.input.filename,
      base64Content: parsed.input.content,
    });
    if (isErr(result)) return failed(result.error);

    return succeeded(result.value);
  };
}
