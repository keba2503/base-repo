import { ok, type Document, type DomainError, type EntityId, type Result, type TenantId } from "@base/domain";
import type {
  CreateDownloadUrlRequest,
  CreateUploadUrlRequest,
  DocumentProcessingOutcome,
  DocumentProcessingRequest,
  DocumentProcessor,
  DocumentRepository,
  FileStore,
  SaveFileRequest,
  StoredFileLocation,
} from "../../src/index";

export class StubDocumentRepository implements DocumentRepository {
  readonly #documents: Map<string, Document>;
  readonly #tenantId: TenantId | undefined;

  constructor(tenantId?: TenantId, shared?: Map<string, Document>) {
    this.#tenantId = tenantId;
    this.#documents = shared ?? new Map<string, Document>();
  }

  scopedTo(tenantId: TenantId): StubDocumentRepository {
    return new StubDocumentRepository(tenantId, this.#documents);
  }

  seed(document: Document): void {
    this.#documents.set(document.id, document);
  }

  #visible(document: Document | undefined): Document | undefined {
    if (!document) return undefined;
    if (this.#tenantId !== undefined && document.tenantId !== this.#tenantId) return undefined;
    return document;
  }

  findById(id: EntityId): Promise<Document | undefined> {
    return Promise.resolve(this.#visible(this.#documents.get(id)));
  }

  list(request: { limit: number }): Promise<readonly Document[]> {
    const visible = [...this.#documents.values()].filter((document) => this.#visible(document) !== undefined);
    return Promise.resolve(visible.slice(0, request.limit));
  }

  save(document: Document): Promise<void> {
    if (this.#tenantId !== undefined && document.tenantId !== this.#tenantId) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    this.#documents.set(document.id, document);
    return Promise.resolve();
  }

  get saved(): readonly Document[] {
    return [...this.#documents.values()];
  }
}

type StoredFile = {
  readonly contentType: string;
  readonly bytes: Uint8Array;
};

export class StubFileStore implements FileStore {
  readonly #files = new Map<string, StoredFile>();
  readonly removed: string[] = [];

  #keyOf(location: StoredFileLocation): string {
    return `${location.tenantId}:${location.storageKey}`;
  }

  save(request: SaveFileRequest): Promise<void> {
    this.#files.set(this.#keyOf(request), { contentType: request.contentType, bytes: request.bytes });
    return Promise.resolve();
  }

  read(location: StoredFileLocation): Promise<Uint8Array | undefined> {
    return Promise.resolve(this.#files.get(this.#keyOf(location))?.bytes);
  }

  remove(location: StoredFileLocation): Promise<void> {
    this.#files.delete(this.#keyOf(location));
    this.removed.push(this.#keyOf(location));
    return Promise.resolve();
  }

  createDownloadUrl(request: CreateDownloadUrlRequest): Promise<string> {
    return Promise.resolve(`stub-download:${request.tenantId}/${request.storageKey}?expiresIn=${String(request.expiresInSeconds)}`);
  }

  createUploadUrl(request: CreateUploadUrlRequest): Promise<string> {
    return Promise.resolve(`stub-upload:${request.tenantId}/${request.storageKey}?expiresIn=${String(request.expiresInSeconds)}`);
  }

  get savedKeys(): readonly string[] {
    return [...this.#files.keys()];
  }
}

export class StubDocumentProcessor implements DocumentProcessor {
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
