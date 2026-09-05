import { describe, expect, it } from "bun:test";
import type { IdempotencyRecord, IdempotencyStore } from "@base/application";

export type IdempotencyStoreHarness = {
  readonly store: IdempotencyStore;
  readonly timeToLiveMilliseconds: number;
  advanceBy(milliseconds: number): void;
};

function recordFactory(overrides: Partial<IdempotencyRecord> = {}): IdempotencyRecord {
  return {
    scope: "tenants.create:tenant-1:subject-1",
    key: "b3f1c9c2-0000-4000-8000-000000000001",
    fingerprint: "sha256:abc",
    reply: { status: 201, body: '{"id":"1"}' },
    ...overrides,
  };
}

export function describeIdempotencyStoreContract(
  name: string,
  createHarness: () => IdempotencyStoreHarness,
): void {
  describe(`${name} satisfies the IdempotencyStore contract`, () => {
    it("returns nothing for an unknown key", async () => {
      const harness = createHarness();
      expect(await harness.store.find({ scope: "s", key: "k" })).toBeUndefined();
    });

    it("returns a saved record by scope and key", async () => {
      const harness = createHarness();
      const record = recordFactory();
      await harness.store.save(record);
      expect(await harness.store.find({ scope: record.scope, key: record.key })).toEqual(record);
    });

    it("keeps the same key apart across scopes", async () => {
      const harness = createHarness();
      const record = recordFactory();
      await harness.store.save(record);
      expect(await harness.store.find({ scope: "another", key: record.key })).toBeUndefined();
    });

    it("replaces a record saved twice under the same key", async () => {
      const harness = createHarness();
      await harness.store.save(recordFactory({ fingerprint: "sha256:first" }));
      await harness.store.save(recordFactory({ fingerprint: "sha256:second" }));
      const found = await harness.store.find({ scope: recordFactory().scope, key: recordFactory().key });
      expect(found?.fingerprint).toBe("sha256:second");
    });

    it("keeps a record until its time to live elapses", async () => {
      const harness = createHarness();
      const record = recordFactory();
      await harness.store.save(record);
      harness.advanceBy(harness.timeToLiveMilliseconds - 1);
      expect(await harness.store.find({ scope: record.scope, key: record.key })).toEqual(record);
    });

    it("forgets a record once its time to live elapsed", async () => {
      const harness = createHarness();
      const record = recordFactory();
      await harness.store.save(record);
      harness.advanceBy(harness.timeToLiveMilliseconds);
      expect(await harness.store.find({ scope: record.scope, key: record.key })).toBeUndefined();
    });
  });
}
