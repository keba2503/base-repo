import type { Document, EntityId } from "@base/domain";

export type ListDocumentsRequest = {
  readonly limit: number;
};

export type DocumentRepository = {
  findById(id: EntityId): Promise<Document | undefined>;
  list(request: ListDocumentsRequest): Promise<readonly Document[]>;
  save(document: Document): Promise<void>;
};
