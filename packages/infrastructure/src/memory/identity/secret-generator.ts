import type { SecretGenerator } from "@base/application";

export const sequentialSecretLength = 43;

export class SequentialSecretGenerator implements SecretGenerator {
  #issued = 0;

  next(): string {
    this.#issued += 1;
    return this.#issued.toString(36).padStart(sequentialSecretLength, "0");
  }
}
