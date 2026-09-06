import { describe, expect, it } from "bun:test";
import type { DocumentProcessor } from "@base/application";
import { isOk } from "@base/domain";

export type DocumentProcessorHarness = {
  readonly processor: DocumentProcessor;
};

const bytes = new TextEncoder().encode("%PDF-1.7 fake pdf body");

export function describeDocumentProcessorContract(name: string, createHarness: () => DocumentProcessorHarness): void {
  describe(`${name} satisfies the DocumentProcessor contract`, () => {
    it("processes a document without throwing", async () => {
      const harness = createHarness();
      const result = await harness.processor.process({ contentType: "application/pdf", bytes });
      expect(isOk(result)).toBe(true);
    });

    it("carries a string or null extracted text on success", async () => {
      const harness = createHarness();
      const result = await harness.processor.process({ contentType: "application/pdf", bytes });
      if (!isOk(result)) throw new Error("Expected the processor to succeed");
      expect(result.value.extractedText === null || typeof result.value.extractedText === "string").toBe(true);
    });
  });
}
