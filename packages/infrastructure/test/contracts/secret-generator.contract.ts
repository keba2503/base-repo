import { describe, expect, it } from "bun:test";
import type { SecretGenerator } from "@base/application";

const urlSafePattern = /^[A-Za-z0-9_-]+$/;

export function describeSecretGeneratorContract(name: string, createGenerator: () => SecretGenerator): void {
  describe(`${name} satisfies the SecretGenerator contract`, () => {
    it("produces at least 32 characters", () => {
      expect(createGenerator().next().length).toBeGreaterThanOrEqual(32);
    });

    it("produces only url safe characters", () => {
      expect(urlSafePattern.test(createGenerator().next())).toBe(true);
    });

    it("never contains the api key separator", () => {
      expect(createGenerator().next().includes(".")).toBe(false);
    });

    it("never repeats a secret", () => {
      const generator = createGenerator();
      const issued = new Set(Array.from({ length: 500 }, () => generator.next()));
      expect(issued.size).toBe(500);
    });
  });
}
