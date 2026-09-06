import type { DocumentProcessingOutcome, DocumentProcessor } from "@base/application";
import { ok, type DomainError, type Result } from "@base/domain";

export class NullDocumentProcessor implements DocumentProcessor {
  process(): Promise<Result<DocumentProcessingOutcome, DomainError>> {
    return Promise.resolve(ok({ extractedText: null }));
  }
}
