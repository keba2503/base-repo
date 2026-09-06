import type { Actor, ListDocuments, ListDocumentsResponse } from "@base/application";
import { isErr } from "@base/domain";
import { failed, succeeded, type Outcome } from "../kernel/outcome";

export type ListDocumentsQuery = {
  readonly actor: Actor;
  readonly limit: number;
};

export type ListDocumentsController = (query: ListDocumentsQuery) => Promise<Outcome<ListDocumentsResponse>>;

export function listDocumentsController(useCase: ListDocuments): ListDocumentsController {
  return async (query) => {
    const result = await useCase({ actor: query.actor, limit: query.limit });
    if (isErr(result)) return failed(result.error);
    return succeeded(result.value);
  };
}
