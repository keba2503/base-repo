import type {
  CreateDownloadUrlRequest,
  CreateUploadUrlRequest,
  FileStore,
  SaveFileRequest,
  StoredFileLocation,
} from "@base/application";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SupabaseStorageClient = Pick<SupabaseClient, "storage">;

export type SupabaseFileStoreOptions = {
  readonly client: SupabaseStorageClient;
  readonly bucket: string;
};

export class SupabaseFileStore implements FileStore {
  readonly #client: SupabaseStorageClient;
  readonly #bucket: string;

  constructor(options: SupabaseFileStoreOptions) {
    this.#client = options.client;
    this.#bucket = options.bucket;
  }

  #pathOf(location: StoredFileLocation): string {
    return `${location.tenantId}/${location.storageKey}`;
  }

  async save(request: SaveFileRequest): Promise<void> {
    const { error } = await this.#client.storage
      .from(this.#bucket)
      .upload(this.#pathOf(request), request.bytes, { contentType: request.contentType, upsert: false });
    if (error) {
      throw new Error(`Supabase Storage could not save the document: ${error.message}`);
    }
  }

  async read(location: StoredFileLocation): Promise<Uint8Array | undefined> {
    const { data, error } = await this.#client.storage.from(this.#bucket).download(this.#pathOf(location));
    if (error) return undefined;
    return new Uint8Array(await data.arrayBuffer());
  }

  async remove(location: StoredFileLocation): Promise<void> {
    const { error } = await this.#client.storage.from(this.#bucket).remove([this.#pathOf(location)]);
    if (error) {
      throw new Error(`Supabase Storage could not remove the document: ${error.message}`);
    }
  }

  async createDownloadUrl(request: CreateDownloadUrlRequest): Promise<string> {
    const { data, error } = await this.#client.storage
      .from(this.#bucket)
      .createSignedUrl(this.#pathOf(request), request.expiresInSeconds);
    if (error) {
      throw new Error(`Supabase Storage could not sign a download url: ${error.message}`);
    }
    return data.signedUrl;
  }

  async createUploadUrl(request: CreateUploadUrlRequest): Promise<string> {
    const { data, error } = await this.#client.storage
      .from(this.#bucket)
      .createSignedUploadUrl(this.#pathOf(request), { upsert: false });
    if (error) {
      throw new Error(`Supabase Storage could not sign an upload url: ${error.message}`);
    }
    return data.signedUrl;
  }
}
