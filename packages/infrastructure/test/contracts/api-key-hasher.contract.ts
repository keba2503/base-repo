import { describe, expect, it } from "bun:test";
import type { ApiKeyHasher } from "@base/application";

const key = "ak_00000000000040008000000000000001.pl4int3xt-secret";

export function describeApiKeyHasherContract(name: string, createHasher: () => ApiKeyHasher): void {
  describe(`${name} satisfies the ApiKeyHasher contract`, () => {
    it("produces a non empty hash", async () => {
      expect((await createHasher().hash({ key })).length).toBeGreaterThan(0);
    });

    it("never embeds the key in the hash", async () => {
      expect((await createHasher().hash({ key })).includes("pl4int3xt")).toBe(false);
    });

    it("verifies the key it hashed", async () => {
      const hasher = createHasher();
      const hash = await hasher.hash({ key });
      expect(await hasher.verify({ key, hash })).toBe(true);
    });

    it("rejects a key that differs by one character", async () => {
      const hasher = createHasher();
      const hash = await hasher.hash({ key });
      expect(await hasher.verify({ key: `${key.slice(0, -1)}X`, hash })).toBe(false);
    });

    it("rejects a hash that is not its own", async () => {
      const hasher = createHasher();
      expect(await hasher.verify({ key, hash: "not-a-hash" })).toBe(false);
    });

    it("rejects an empty hash", async () => {
      const hasher = createHasher();
      expect(await hasher.verify({ key, hash: "" })).toBe(false);
    });

    it("produces different hashes for different keys", async () => {
      const hasher = createHasher();
      expect(await hasher.hash({ key })).not.toBe(await hasher.hash({ key: `${key}2` }));
    });
  });
}
