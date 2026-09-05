import { describe, expect, it } from "bun:test";
import type { IdGenerator } from "@base/application";
import { isOk, parseEntityId } from "@base/domain";

export function describeIdGeneratorContract(name: string, createGenerator: () => IdGenerator): void {
  describe(`${name} satisfies the IdGenerator contract`, () => {
    it("produces a valid entity identifier", () => {
      expect(isOk(parseEntityId(createGenerator().next()))).toBe(true);
    });

    it("never repeats an identifier", () => {
      const generator = createGenerator();
      const issued = new Set(Array.from({ length: 500 }, () => generator.next()));
      expect(issued.size).toBe(500);
    });
  });
}
