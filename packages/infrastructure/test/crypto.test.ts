import { describe, expect, it } from "bun:test";
import { AesGcmFieldCipher } from "@base/infrastructure";
import { describeFieldCipherContract } from "./contracts/index";

const primaryKey = { id: "k1", key: Buffer.alloc(32, 1) };
const previousKey = { id: "k0", key: Buffer.alloc(32, 2) };

describeFieldCipherContract("AesGcmFieldCipher", () => new AesGcmFieldCipher({ keys: [primaryKey] }));

describe("AesGcmFieldCipher key rotation", () => {
  it("still decrypts a value encrypted under a previous key once that key is kept", async () => {
    const beforeRotation = new AesGcmFieldCipher({ keys: [previousKey] });
    const ciphertext = await beforeRotation.encrypt("dato sensible");

    const afterRotation = new AesGcmFieldCipher({ keys: [primaryKey, previousKey] });
    expect(await afterRotation.decrypt(ciphertext)).toBe("dato sensible");
  });

  it("encrypts new values under the current, first configured key", async () => {
    const cipher = new AesGcmFieldCipher({ keys: [primaryKey, previousKey] });
    const ciphertext = await cipher.encrypt("dato sensible");
    expect(ciphertext.split(":")[1]).toBe("k1");
  });

  it("refuses to decrypt once the key it was encrypted with is retired", async () => {
    const beforeRotation = new AesGcmFieldCipher({ keys: [previousKey] });
    const ciphertext = await beforeRotation.encrypt("dato sensible");

    const afterFullRotation = new AesGcmFieldCipher({ keys: [primaryKey] });
    const caught = await afterFullRotation.decrypt(ciphertext).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(caught).toBeInstanceOf(Error);
  });

  it("rejects a key with the wrong byte length", () => {
    expect(() => new AesGcmFieldCipher({ keys: [{ id: "short", key: Buffer.alloc(16) }] })).toThrow();
  });
});
