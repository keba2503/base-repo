import { describe, expect, it } from "bun:test";
import type { Clock } from "@base/application";

export function describeClockContract(name: string, createClock: () => Clock): void {
  describe(`${name} satisfies the Clock contract`, () => {
    it("returns a date", () => {
      expect(createClock().now()).toBeInstanceOf(Date);
    });

    it("returns a valid instant", () => {
      expect(Number.isNaN(createClock().now().getTime())).toBe(false);
    });

    it("never moves backwards", () => {
      const clock = createClock();
      const first = clock.now().getTime();
      const second = clock.now().getTime();
      expect(second).toBeGreaterThanOrEqual(first);
    });

    it("hands out a copy that callers cannot mutate", () => {
      const clock = createClock();
      const instant = clock.now();
      const before = instant.getTime();
      instant.setFullYear(1999);
      expect(clock.now().getTime()).toBeGreaterThanOrEqual(before);
    });
  });
}
