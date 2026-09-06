import { beforeEach, describe, expect, it } from "bun:test";
import { isErr, isOk, type DomainError, type Result } from "@base/domain";
import { getDocument, type DocumentResponse, type GetDocument } from "../src/index";
import { actorFactory, tenantIdFactory } from "./factories/actor";
import { documentFactory } from "./factories/document";
import { StubPermissions } from "./doubles/ports";
import { StubDocumentRepository } from "./doubles/documents-ports";

type Harness = {
  useCase: GetDocument;
  documents: StubDocumentRepository;
  permissions: StubPermissions;
};

function harnessFactory(granted: readonly string[] = ["documents:read"]): Harness {
  const documents = new StubDocumentRepository();
  const permissions = new StubPermissions(granted);
  const useCase = getDocument({ documentsScopedTo: (tenantId) => documents.scopedTo(tenantId), permissions });
  return { useCase, documents, permissions };
}

function expectOk(result: Result<DocumentResponse, DomainError>): DocumentResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

function expectErr(result: Result<DocumentResponse, DomainError>): DomainError {
  if (!isErr(result)) throw new Error("Expected a failure");
  return result.error;
}

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("reading a document", () => {
  it("returns the document by id", async () => {
    const document = documentFactory();
    harness.documents.seed(document);
    const response = expectOk(await harness.useCase({ actor: actorFactory({ tenantId: tenantIdFactory(1) }), documentId: document.id }));
    expect(response.id).toBe(document.id);
  });

  it("refuses an actor without the read permission", async () => {
    const denied = harnessFactory([]);
    const document = documentFactory();
    denied.documents.seed(document);
    const error = expectErr(await denied.useCase({ actor: actorFactory({ tenantId: tenantIdFactory(1) }), documentId: document.id }));
    expect(error.kind).toBe("forbidden");
  });

  it("refuses an id that is not a valid identifier", async () => {
    const error = expectErr(await harness.useCase({ actor: actorFactory({ tenantId: tenantIdFactory(1) }), documentId: "not-an-id" }));
    expect(error.code).toBe("document.notFound");
  });

  it("refuses a document from another tenant", async () => {
    const document = documentFactory({ tenantId: tenantIdFactory(2) });
    harness.documents.seed(document);
    const error = expectErr(await harness.useCase({ actor: actorFactory({ tenantId: tenantIdFactory(1) }), documentId: document.id }));
    expect(error.code).toBe("document.notFound");
  });
});
