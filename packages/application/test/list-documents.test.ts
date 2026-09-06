import { beforeEach, describe, expect, it } from "bun:test";
import { isErr, isOk, type DomainError, type Result } from "@base/domain";
import { listDocuments, type ListDocuments, type ListDocumentsResponse } from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import { documentFactory } from "./factories/document";
import { entityIdFactory } from "./factories/identity";
import { StubPermissions } from "./doubles/ports";
import { StubDocumentRepository } from "./doubles/documents-ports";

type Harness = {
  useCase: ListDocuments;
  documents: StubDocumentRepository;
};

function harnessFactory(granted: readonly string[] = ["documents:read"]): Harness {
  const documents = new StubDocumentRepository();
  const permissions = new StubPermissions(granted);
  const useCase = listDocuments({ documentsScopedTo: (tenantId) => documents.scopedTo(tenantId), permissions });
  return { useCase, documents };
}

function expectOk(result: Result<ListDocumentsResponse, DomainError>): ListDocumentsResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

function expectErr(result: Result<ListDocumentsResponse, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("listing documents", () => {
  it("returns the tenant's documents", async () => {
    harness.documents.seed(documentFactory({ id: entityIdFactory(1) }));
    harness.documents.seed(documentFactory({ id: entityIdFactory(2) }));
    const response = expectOk(await harness.useCase({ actor: actorFactory({ tenantId: tenantIdFactory(1) }), limit: 10 }));
    expect(response.documents).toHaveLength(2);
  });

  it("excludes documents from another tenant", async () => {
    harness.documents.seed(documentFactory({ id: entityIdFactory(1), tenantId: tenantIdFactory(2) }));
    const response = expectOk(await harness.useCase({ actor: actorFactory({ tenantId: tenantIdFactory(1) }), limit: 10 }));
    expect(response.documents).toEqual([]);
  });

  it("respects the limit", async () => {
    harness.documents.seed(documentFactory({ id: entityIdFactory(1) }));
    harness.documents.seed(documentFactory({ id: entityIdFactory(2) }));
    const response = expectOk(await harness.useCase({ actor: actorFactory({ tenantId: tenantIdFactory(1) }), limit: 1 }));
    expect(response.documents).toHaveLength(1);
  });

  it("refuses an actor without the read permission", async () => {
    const denied = harnessFactory([]);
    const error = expectErr(await denied.useCase({ actor: actorFactory({ tenantId: tenantIdFactory(1) }), limit: 10 }));
    expect(error.kind).toBe("forbidden");
  });
});
