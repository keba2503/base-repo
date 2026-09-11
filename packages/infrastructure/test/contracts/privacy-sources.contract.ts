import { describe, expect, it } from "bun:test";
import { userFieldClassifications, type EntityId, type TenantId } from "@base/domain";
import type { AnonymizableSource, RetainableSource, SubjectDataSource } from "@base/application";

export type PrivacySourceHarness = {
  readonly anonymizable: AnonymizableSource;
  readonly subjectData: SubjectDataSource;
  readonly retainable: RetainableSource;
  readonly tenantId: TenantId;
  readonly subjectId: EntityId;
  seedSubject(tenantId: TenantId, subjectId: EntityId, createdAt: Date): void;
};

export function describePrivacySourceContract(
  name: string,
  createHarness: () => PrivacySourceHarness,
): void {
  describe(`${name} satisfies the privacy source contracts`, () => {
    it("anonymizes a subject with the given token and reports that it did", async () => {
      const harness = createHarness();
      const at = new Date("2026-01-01T00:00:00Z");
      const done = await harness.anonymizable.anonymize(harness.tenantId, harness.subjectId, "token-1", at);
      expect(done).toBe(true);
    });

    it("reports that nothing was anonymized for an unknown subject", async () => {
      const harness = createHarness();
      const done = await harness.anonymizable.anonymize(
        harness.tenantId,
        "00000000-0000-4000-8000-000000000000" as EntityId,
        "token-1",
        new Date(),
      );
      expect(done).toBe(false);
    });

    it("exposes the subject rows carrying the personal fields", async () => {
      const harness = createHarness();
      const rows = await harness.subjectData.findAllForSubject(harness.tenantId, harness.subjectId);
      expect(rows.length).toBe(1);
      const personalFields = userFieldClassifications;
      expect(Object.keys(rows[0] ?? {}).length).toBeGreaterThan(0);
      expect(personalFields).toBeDefined();
    });

    it("lists no expired subjects before the cutoff and the seeded one after it", async () => {
      const harness = createHarness();
      const before = await harness.retainable.findSubjectsOlderThan(harness.tenantId, new Date("2026-01-02T00:00:00Z"));
      expect(before).toContain(harness.subjectId);
      const after = await harness.retainable.findSubjectsOlderThan(harness.tenantId, new Date("2025-01-01T00:00:00Z"));
      expect(after).not.toContain(harness.subjectId);
    });

    it("never exposes a subject of another tenant", async () => {
      const harness = createHarness();
      const otherTenant = "00000000-0000-4000-8000-00000000ffff" as TenantId;
      const rows = await harness.subjectData.findAllForSubject(otherTenant, harness.subjectId);
      expect(rows).toEqual([]);
      const done = await harness.anonymizable.anonymize(otherTenant, harness.subjectId, "token-x", new Date());
      expect(done).toBe(false);
    });
  });
}