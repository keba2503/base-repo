import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { FieldCipher } from "@base/application";

export type FieldEncryptionKey = {
  readonly id: string;
  readonly key: Buffer;
};

export type AesGcmFieldCipherOptions = {
  readonly keys: readonly FieldEncryptionKey[];
};

export const aesGcmFieldCipherVersion = "v1";
export const aesGcmKeyByteLength = 32;
export const aesGcmIvByteLength = 12;
const algorithm = "aes-256-gcm";

function assertKeyLength(key: FieldEncryptionKey): void {
  if (key.key.length !== aesGcmKeyByteLength) {
    throw new Error(`The field encryption key ${key.id} must be ${String(aesGcmKeyByteLength)} bytes, aes-256-gcm requires it`);
  }
}

export class AesGcmFieldCipher implements FieldCipher {
  readonly #keys: readonly FieldEncryptionKey[];
  readonly #current: FieldEncryptionKey;

  constructor(options: AesGcmFieldCipherOptions) {
    if (options.keys.length === 0) {
      throw new Error("The field cipher needs at least one encryption key");
    }
    for (const key of options.keys) assertKeyLength(key);
    this.#keys = options.keys;
    const current = this.#keys[0];
    if (!current) throw new Error("The field cipher needs at least one encryption key");
    this.#current = current;
  }

  encrypt(plaintext: string): Promise<string> {
    return Promise.resolve().then(() => {
      const iv = randomBytes(aesGcmIvByteLength);
      const cipher = createCipheriv(algorithm, this.#current.key, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      const payload = Buffer.concat([encrypted, tag]);
      return [aesGcmFieldCipherVersion, this.#current.id, iv.toString("base64url"), payload.toString("base64url")].join(":");
    });
  }

  decrypt(ciphertext: string): Promise<string> {
    return Promise.resolve().then(() => {
      const [version, keyId, ivPart, payloadPart, ...rest] = ciphertext.split(":");
      if (version !== aesGcmFieldCipherVersion || keyId === undefined || ivPart === undefined || payloadPart === undefined || rest.length > 0) {
        throw new Error("The ciphertext does not match the expected aes-gcm field cipher format");
      }
      const key = this.#keys.find((candidate) => candidate.id === keyId);
      if (!key) throw new Error(`No encryption key ${keyId} is configured to decrypt this value`);
      const iv = Buffer.from(ivPart, "base64url");
      const payload = Buffer.from(payloadPart, "base64url");
      const tag = payload.subarray(payload.length - 16);
      const encrypted = payload.subarray(0, payload.length - 16);
      const decipher = createDecipheriv(algorithm, key.key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString("utf8");
    });
  }
}
