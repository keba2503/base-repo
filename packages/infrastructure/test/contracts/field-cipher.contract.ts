import { describe, expect, it } from "bun:test";
import type { FieldCipher } from "@base/application";

export function describeFieldCipherContract(name: string, createCipher: () => FieldCipher): void {
  describe(`${name} satisfies the FieldCipher contract`, () => {
    it("decrypts back to the original plaintext", async () => {
      const cipher = createCipher();
      const ciphertext = await cipher.encrypt("informe confidencial del paciente");
      expect(await cipher.decrypt(ciphertext)).toBe("informe confidencial del paciente");
    });

    it("never stores the plaintext verbatim", async () => {
      const cipher = createCipher();
      const ciphertext = await cipher.encrypt("informe confidencial del paciente");
      expect(ciphertext.includes("informe confidencial del paciente")).toBe(false);
    });

    it("produces a different ciphertext for the same plaintext on every call", async () => {
      const cipher = createCipher();
      const first = await cipher.encrypt("mismo texto");
      const second = await cipher.encrypt("mismo texto");
      expect(first).not.toBe(second);
    });

    it("round trips an empty string", async () => {
      const cipher = createCipher();
      expect(await cipher.decrypt(await cipher.encrypt(""))).toBe("");
    });
  });
}
