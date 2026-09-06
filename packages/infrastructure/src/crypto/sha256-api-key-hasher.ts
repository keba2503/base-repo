import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiKeyHasher, HashApiKeyRequest, VerifyApiKeyRequest } from "@base/application";

export type Sha256ApiKeyHasherOptions = {
  readonly pepper: string;
};

export const sha256HashMarker = "sha256:";
export const apiKeyPepperMinimumLength = 32;

export class Sha256ApiKeyHasher implements ApiKeyHasher {
  readonly #pepper: Buffer;

  constructor(options: Sha256ApiKeyHasherOptions) {
    if (options.pepper.length < apiKeyPepperMinimumLength) {
      throw new Error(
        `The api key pepper must have at least ${String(apiKeyPepperMinimumLength)} characters`,
      );
    }
    this.#pepper = Buffer.from(options.pepper, "utf8");
  }

  #digest(key: string): Buffer {
    return createHmac("sha256", this.#pepper).update(key, "utf8").digest();
  }

  hash(request: HashApiKeyRequest): Promise<string> {
    return Promise.resolve(`${sha256HashMarker}${this.#digest(request.key).toString("hex")}`);
  }

  verify(request: VerifyApiKeyRequest): Promise<boolean> {
    if (!request.hash.startsWith(sha256HashMarker)) return Promise.resolve(false);
    const stored = Buffer.from(request.hash.slice(sha256HashMarker.length), "hex");
    const computed = this.#digest(request.key);
    if (stored.length !== computed.length) return Promise.resolve(false);
    return Promise.resolve(timingSafeEqual(stored, computed));
  }
}
