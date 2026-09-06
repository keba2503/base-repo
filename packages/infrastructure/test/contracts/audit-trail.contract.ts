import { describe, expect, it } from "bun:test";
import type { AuditTrail } from "@base/application";
import { auditEntryInputFactory } from "../factories/audit";
import { entityIdFactory } from "../factories/identity";

export type AuditTrailHarness = {
  readonly audit: AuditTrail;
};

export function describeAuditTrailContract(name: string, createHarness: () => AuditTrailHarness): void {
  describe(`${name} satisfies the AuditTrail contract`, () => {
    it("records an entry without raising", async () => {
      const harness = createHarness();
      let raised: unknown;
      try {
        await harness.audit.record(auditEntryInputFactory());
      } catch (error: unknown) {
        raised = error;
      }
      expect(raised).toBeUndefined();
    });

    it("finds the most recently recorded entries first", async () => {
      const harness = createHarness();
      await harness.audit.record(auditEntryInputFactory({ occurredAt: new Date("2026-01-15T10:00:00.000Z"), action: "first" }));
      await harness.audit.record(auditEntryInputFactory({ occurredAt: new Date("2026-01-15T11:00:00.000Z"), action: "second" }));
      const recent = await harness.audit.findRecent(10);
      expect(recent.map((entry) => entry.action)).toEqual(["second", "first"]);
    });

    it("limits how many recent entries come back", async () => {
      const harness = createHarness();
      await harness.audit.record(auditEntryInputFactory({ occurredAt: new Date("2026-01-15T10:00:00.000Z") }));
      await harness.audit.record(auditEntryInputFactory({ occurredAt: new Date("2026-01-15T11:00:00.000Z") }));
      const recent = await harness.audit.findRecent(1);
      expect(recent).toHaveLength(1);
    });

    it("finds every entry recorded against a resource", async () => {
      const harness = createHarness();
      const resourceId = entityIdFactory(99);
      await harness.audit.record(auditEntryInputFactory({ resourceType: "consent", resourceId, action: "consent:grant" }));
      await harness.audit.record(auditEntryInputFactory({ resourceType: "consent", resourceId, action: "consent:withdraw" }));
      await harness.audit.record(auditEntryInputFactory({ resourceType: "consent", resourceId: entityIdFactory(1) }));
      const forResource = await harness.audit.findForResource("consent", resourceId);
      expect(forResource).toHaveLength(2);
    });

    it("assigns every recorded entry its own identity", async () => {
      const harness = createHarness();
      await harness.audit.record(auditEntryInputFactory());
      await harness.audit.record(auditEntryInputFactory());
      const recent = await harness.audit.findRecent(10);
      expect(new Set(recent.map((entry) => entry.id)).size).toBe(recent.length);
    });
  });
}
