import { describe, expect, it } from "bun:test";
import type { TenantScope, UnitOfWork } from "@base/application";

const registryScope: TenantScope = { kind: "registry" };

export function describeUnitOfWorkContract(
  name: string,
  createUnitOfWork: () => UnitOfWork,
): void {
  describe(`${name} satisfies the UnitOfWork contract`, () => {
    it("returns the value produced by the work", async () => {
      expect(await createUnitOfWork().run(registryScope, () => Promise.resolve(42))).toBe(42);
    });

    it("runs the work exactly once", async () => {
      let runs = 0;
      await createUnitOfWork().run(registryScope, () => {
        runs += 1;
        return Promise.resolve(undefined);
      });
      expect(runs).toBe(1);
    });

    it("propagates a failure raised by the work", async () => {
      const failing = createUnitOfWork().run(registryScope, () => Promise.reject(new Error("boom")));
      const caught = await failing.then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(Error);
    });

    it("accepts a new unit after a failed one", async () => {
      const unitOfWork = createUnitOfWork();
      await unitOfWork.run(registryScope, () => Promise.reject(new Error("boom"))).catch(() => undefined);
      expect(await unitOfWork.run(registryScope, () => Promise.resolve("recovered"))).toBe("recovered");
    });
  });
}
