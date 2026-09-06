import type { DocumentProcessingOutcome, DocumentProcessingRequest, DocumentProcessor } from "@base/application";
import { ok, type DomainError, type Result } from "@base/domain";

export class InMemoryDocumentProcessor implements DocumentProcessor {
  readonly requests: DocumentProcessingRequest[] = [];
  #outcome: Result<DocumentProcessingOutcome, DomainError> = ok({ extractedText: null });

  resolveWith(outcome: Result<DocumentProcessingOutcome, DomainError>): void {
    this.#outcome = outcome;
  }

  process(request: DocumentProcessingRequest): Promise<Result<DocumentProcessingOutcome, DomainError>> {
    this.requests.push(request);
    return Promise.resolve(this.#outcome);
  }
}
