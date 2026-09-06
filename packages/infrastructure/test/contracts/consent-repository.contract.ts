import { describe, expect, it } from "bun:test";
import type { ConsentRepository } from "@base/application";
import { consentFactory } from "../factories/consent";
import { entityIdFactory } from "../factories/identity";

export type ConsentRepositoryHarness = {
  readonly consents: ConsentRepository;
};

export function describeConsentRepositoryContract(
  name: string,
  createHarness: () => ConsentRepositoryHarness,
): void {
  describe(`${name} satisfies the ConsentRepository contract`, () => {
    it("finds the active consent for a subject and a category", async () => {
      const harness = createHarness();
      const consent = consentFactory({ id: entityIdFactory(1) });
      await harness.consents.save(consent);
      const found = await harness.consents.findActive(consent.subjectId, "analytics");
      expect(found?.id).toBe(consent.id);
    });

    it("finds nothing once the consent was withdrawn", async () => {
      const harness = createHarness();
      const consent = consentFactory({ id: entityIdFactory(1) });
      consent.withdraw(new Date("2026-02-01T00:00:00.000Z"));
      await harness.consents.save(consent);
      expect(await harness.consents.findActive(consent.subjectId, "analytics")).toBeUndefined();
    });

    it("finds nothing for a category never consented", async () => {
      const harness = createHarness();
      const consent = consentFactory({ id: entityIdFactory(1) });
      await harness.consents.save(consent);
      expect(await harness.consents.findActive(consent.subjectId, "marketing")).toBeUndefined();
    });

    it("keeps the withdrawn record when listing the full history of a subject", async () => {
      const harness = createHarness();
      const consent = consentFactory({ id: entityIdFactory(1) });
      consent.withdraw(new Date("2026-02-01T00:00:00.000Z"));
      await harness.consents.save(consent);
      const history = await harness.consents.findAllForSubject(consent.subjectId);
      expect(history).toHaveLength(1);
      expect(history[0]?.withdrawnAt).not.toBeNull();
    });

    it("keeps every grant of the same category as its own record across policy versions", async () => {
      const harness = createHarness();
      const subjectId = entityIdFactory(9);
      const first = consentFactory({ id: entityIdFactory(1), subjectId, policyVersion: "2026-01-01" });
      first.withdraw(new Date("2026-01-20T00:00:00.000Z"));
      await harness.consents.save(first);
      const second = consentFactory({
        id: entityIdFactory(2),
        subjectId,
        policyVersion: "2026-06-01",
        grantedAt: new Date("2026-06-02T00:00:00.000Z"),
      });
      await harness.consents.save(second);

      const history = await harness.consents.findAllForSubject(subjectId);
      expect(history).toHaveLength(2);
      const active = await harness.consents.findActive(subjectId, "analytics");
      expect(active?.id).toBe(second.id);
    });
  });
}
