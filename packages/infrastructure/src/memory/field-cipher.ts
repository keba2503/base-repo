import type { FieldCipher } from "@base/application";

export const inMemoryFieldCipherMarker = "memory:";
const nonceByteLength = 8;

export class InMemoryFieldCipher implements FieldCipher {
  encrypt(plaintext: string): Promise<string> {
    const nonce = crypto.getRandomValues(new Uint8Array(nonceByteLength));
    const encoded = Buffer.from(plaintext, "utf8").toString("base64url");
    return Promise.resolve(`${inMemoryFieldCipherMarker}${Buffer.from(nonce).toString("base64url")}:${encoded}`);
  }

  decrypt(ciphertext: string): Promise<string> {
    return Promise.resolve().then(() => {
      if (!ciphertext.startsWith(inMemoryFieldCipherMarker)) {
        throw new Error("The in memory field cipher cannot decrypt a value it did not encrypt");
      }
      const [, encoded] = ciphertext.slice(inMemoryFieldCipherMarker.length).split(":");
      if (encoded === undefined) {
        throw new Error("The in memory field cipher received a malformed ciphertext");
      }
      return Buffer.from(encoded, "base64url").toString("utf8");
    });
  }
}
