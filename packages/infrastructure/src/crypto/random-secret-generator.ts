import type { SecretGenerator } from "@base/application";

export const randomSecretByteLength = 32;

export class RandomSecretGenerator implements SecretGenerator {
  next(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(randomSecretByteLength));
    return Buffer.from(bytes).toString("base64url");
  }
}
