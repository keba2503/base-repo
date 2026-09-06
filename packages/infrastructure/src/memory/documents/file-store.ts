import type {
  CreateDownloadUrlRequest,
  CreateUploadUrlRequest,
  FileStore,
  SaveFileRequest,
  StoredFileLocation,
} from "@base/application";

type StoredFile = {
  readonly contentType: string;
  readonly bytes: Uint8Array;
};

export class InMemoryFileStore implements FileStore {
  readonly #files = new Map<string, StoredFile>();

  #keyOf(location: StoredFileLocation): string {
    return `${location.tenantId}/${location.storageKey}`;
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
    return Promise.resolve();
  }

  createDownloadUrl(request: CreateDownloadUrlRequest): Promise<string> {
    const expiresAt = Date.now() + request.expiresInSeconds * 1_000;
    return Promise.resolve(`memory-download:${this.#keyOf(request)}?expiresAt=${String(expiresAt)}`);
  }

  createUploadUrl(request: CreateUploadUrlRequest): Promise<string> {
    const expiresAt = Date.now() + request.expiresInSeconds * 1_000;
    return Promise.resolve(`memory-upload:${this.#keyOf(request)}?expiresAt=${String(expiresAt)}`);
  }
}
