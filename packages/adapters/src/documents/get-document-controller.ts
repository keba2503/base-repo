import type { Actor, DocumentResponse, GetDocument } from "@base/application";
import { isErr } from "@base/domain";
import { failed, succeeded, type Outcome } from "../kernel/outcome";

export type GetDocumentQuery = {
  readonly actor: Actor;
  readonly documentId: string;
};

export type GetDocumentController = (query: GetDocumentQuery) => Promise<Outcome<DocumentResponse>>;

export function getDocumentController(useCase: GetDocument): GetDocumentController {
  return async (query) => {
    const result = await useCase({ actor: query.actor, documentId: query.documentId });
    if (isErr(result)) return failed(result.error);
    return succeeded(result.value);
  };
}
