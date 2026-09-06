import type { TenantId } from "@base/domain";

export type StoredFileLocation = {
  readonly tenantId: TenantId;
  readonly storageKey: string;
};

export type SaveFileRequest = StoredFileLocation & {
  readonly contentType: string;
  readonly bytes: Uint8Array;
};

export type CreateDownloadUrlRequest = StoredFileLocation & {
  readonly expiresInSeconds: number;
};

export type CreateUploadUrlRequest = StoredFileLocation & {
  readonly expiresInSeconds: number;
};

export type FileStore = {
  save(request: SaveFileRequest): Promise<void>;
  read(location: StoredFileLocation): Promise<Uint8Array | undefined>;
  remove(location: StoredFileLocation): Promise<void>;
  createDownloadUrl(request: CreateDownloadUrlRequest): Promise<string>;
  createUploadUrl(request: CreateUploadUrlRequest): Promise<string>;
};
