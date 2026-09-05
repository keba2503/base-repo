import { describe, expect, it } from "bun:test";
import type { Logger } from "@base/application";

export function describeLoggerContract(name: string, createLogger: () => Logger): void {
  describe(`${name} satisfies the Logger contract`, () => {
    it("accepts a message without fields at every level", () => {
      const logger = createLogger();
      expect(() => {
        logger.info("started");
        logger.warn("degraded");
        logger.error("failed");
      }).not.toThrow();
    });

    it("accepts a message with fields at every level", () => {
      const logger = createLogger();
      expect(() => {
        logger.info("started", { attempt: 1 });
        logger.warn("degraded", { attempt: 2 });
        logger.error("failed", { attempt: 3 });
      }).not.toThrow();
    });

    it("exposes the three levels", () => {
      const logger = createLogger();
      expect([typeof logger.info, typeof logger.warn, typeof logger.error]).toEqual([
        "function",
        "function",
        "function",
      ]);
    });
  });
}
