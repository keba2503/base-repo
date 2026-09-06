import { describe, expect, it } from "bun:test";
import type { FileStore } from "@base/application";
import { tenantIdFactory } from "../factories/tenant";

export type FileStoreHarness = {
  readonly store: FileStore;
};

const ownTenant = tenantIdFactory(1);
const otherTenant = tenantIdFactory(2);
const bytes = new TextEncoder().encode("hola mundo");

export function describeFileStoreContract(name: string, createHarness: () => FileStoreHarness): void {
  describe(`${name} satisfies the FileStore contract`, () => {
    it("reads back the bytes it saved", async () => {
      const harness = createHarness();
      await harness.store.save({ tenantId: ownTenant, storageKey: "a", contentType: "text/plain", bytes });
      expect(await harness.store.read({ tenantId: ownTenant, storageKey: "a" })).toEqual(bytes);
    });

    it("returns nothing for a storage key that was never saved", async () => {
      const harness = createHarness();
      expect(await harness.store.read({ tenantId: ownTenant, storageKey: "missing" })).toBeUndefined();
    });

    it("returns nothing after the file is removed", async () => {
      const harness = createHarness();
      await harness.store.save({ tenantId: ownTenant, storageKey: "a", contentType: "text/plain", bytes });
      await harness.store.remove({ tenantId: ownTenant, storageKey: "a" });
      expect(await harness.store.read({ tenantId: ownTenant, storageKey: "a" })).toBeUndefined();
    });

    it("keeps the same storage key separate between tenants", async () => {
      const harness = createHarness();
      const otherBytes = new TextEncoder().encode("otro contenido");
      await harness.store.save({ tenantId: ownTenant, storageKey: "a", contentType: "text/plain", bytes });
      await harness.store.save({ tenantId: otherTenant, storageKey: "a", contentType: "text/plain", bytes: otherBytes });
      expect(await harness.store.read({ tenantId: ownTenant, storageKey: "a" })).toEqual(bytes);
      expect(await harness.store.read({ tenantId: otherTenant, storageKey: "a" })).toEqual(otherBytes);
    });

    it("produces a download url naming the storage key", async () => {
      const harness = createHarness();
      await harness.store.save({ tenantId: ownTenant, storageKey: "a", contentType: "text/plain", bytes });
      const url = await harness.store.createDownloadUrl({ tenantId: ownTenant, storageKey: "a", expiresInSeconds: 60 });
      expect(url.length).toBeGreaterThan(0);
    });

    it("produces an upload url for a storage key that does not exist yet", async () => {
      const harness = createHarness();
      const url = await harness.store.createUploadUrl({
        tenantId: ownTenant,
        storageKey: "upload-key",
        expiresInSeconds: 60,
      });
      expect(url.length).toBeGreaterThan(0);
    });
  });
}
