import { describe, expect, it } from "bun:test";
import type { DocumentRepository } from "@base/application";
import type { Document, TenantId } from "@base/domain";
import { documentFactory } from "../factories/document";
import { entityIdFactory } from "../factories/identity";
import { tenantIdFactory } from "../factories/tenant";

export type DocumentRepositoryHarness = {
  readonly registry: DocumentRepository;
  scopedTo(tenantId: TenantId): DocumentRepository;
};

const ownTenant = tenantIdFactory(1);
const otherTenant = tenantIdFactory(2);

function idOf(document: Document | undefined): string | undefined {
  return document?.id;
}

export function describeDocumentRepositoryContract(
  name: string,
  createHarness: () => DocumentRepositoryHarness,
): void {
  describe(`${name} satisfies the DocumentRepository contract`, () => {
    it("finds a saved document by id", async () => {
      const harness = createHarness();
      const document = documentFactory({ id: entityIdFactory(1) });
      await harness.registry.save(document);
      expect(idOf(await harness.registry.findById(entityIdFactory(1)))).toBe(document.id);
    });

    it("returns nothing for an unknown id", async () => {
      const harness = createHarness();
      expect(await harness.registry.findById(entityIdFactory(99))).toBeUndefined();
    });

    it("lists documents ordered by most recent first", async () => {
      const harness = createHarness();
      await harness.registry.save(
        documentFactory({ id: entityIdFactory(1), storageKey: entityIdFactory(1), createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      );
      await harness.registry.save(
        documentFactory({ id: entityIdFactory(2), storageKey: entityIdFactory(2), createdAt: new Date("2026-01-02T00:00:00.000Z") }),
      );
      const listed = await harness.registry.list({ limit: 10 });
      expect(listed.map((document) => document.id)).toEqual([entityIdFactory(2), entityIdFactory(1)]);
    });

    it("respects the list limit", async () => {
      const harness = createHarness();
      await harness.registry.save(documentFactory({ id: entityIdFactory(1), storageKey: entityIdFactory(1) }));
      await harness.registry.save(documentFactory({ id: entityIdFactory(2), storageKey: entityIdFactory(2) }));
      expect(await harness.registry.list({ limit: 1 })).toHaveLength(1);
    });

    it("replaces a document saved twice, carrying its new status", async () => {
      const harness = createHarness();
      const document = documentFactory({ id: entityIdFactory(1) });
      await harness.registry.save(document);
      document.startProcessing(new Date("2026-01-16T10:00:00.000Z"));
      await harness.registry.save(document);
      const stored = await harness.registry.findById(entityIdFactory(1));
      expect(stored?.status).toBe("processing");
    });

    it("lets a tenant scoped repository read its own document", async () => {
      const harness = createHarness();
      const scoped = harness.scopedTo(ownTenant);
      const document = documentFactory({ id: entityIdFactory(1), tenantId: ownTenant });
      await scoped.save(document);
      expect(idOf(await scoped.findById(entityIdFactory(1)))).toBe(document.id);
    });

    it("hides another tenant's document from a tenant scoped repository looking up by id", async () => {
      const harness = createHarness();
      await harness.registry.save(documentFactory({ id: entityIdFactory(1), tenantId: otherTenant }));
      const scoped = harness.scopedTo(ownTenant);
      expect(await scoped.findById(entityIdFactory(1))).toBeUndefined();
    });

    it("hides another tenant's document from a tenant scoped repository listing documents", async () => {
      const harness = createHarness();
      await harness.registry.save(documentFactory({ id: entityIdFactory(1), tenantId: otherTenant }));
      const scoped = harness.scopedTo(ownTenant);
      expect(await scoped.list({ limit: 10 })).toEqual([]);
    });

    it("refuses a write outside the scope of a tenant scoped repository", async () => {
      const harness = createHarness();
      const scoped = harness.scopedTo(ownTenant);
      const rejected = Promise.resolve().then(() =>
        scoped.save(documentFactory({ id: entityIdFactory(1), tenantId: otherTenant })),
      );
      const caught = await rejected.then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(Error);
    });
  });
}
