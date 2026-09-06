import type { DomainError, Result } from "@base/domain";

export type DocumentProcessingRequest = {
  readonly contentType: string;
  readonly bytes: Uint8Array;
};

export type DocumentProcessingOutcome = {
  readonly extractedText: string | null;
};

export type DocumentProcessor = {
  process(request: DocumentProcessingRequest): Promise<Result<DocumentProcessingOutcome, DomainError>>;
};
