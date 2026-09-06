import { beforeEach, describe, expect, it } from "bun:test";
import { isOk, type DomainError, type Result } from "@base/domain";
import { createDocumentUpload, type CreateDocumentUpload, type CreateDocumentUploadResponse } from "../src/index";
import { actorFactory } from "./factories/actor";
import { StubIdGenerator, StubPermissions } from "./doubles/ports";
import { StubFileStore } from "./doubles/documents-ports";

type Harness = {
  useCase: CreateDocumentUpload;
  fileStore: StubFileStore;
  permissions: StubPermissions;
};

function harnessFactory(granted: readonly string[] = ["documents:upload"]): Harness {
  const fileStore = new StubFileStore();
  const permissions = new StubPermissions(granted);
  const useCase = createDocumentUpload({ fileStore, permissions, idGenerator: new StubIdGenerator() });
  return { useCase, fileStore, permissions };
}

function expectOk(result: Result<CreateDocumentUploadResponse, DomainError>): CreateDocumentUploadResponse {
  if (!isOk(result)) throw new Error(`Expected a success, received ${result.error.code}`);
  return result.value;
}

let harness: Harness;

beforeEach(() => {
  harness = harnessFactory();
});

describe("requesting a document upload url", () => {
  it("returns a storage key and an upload url", async () => {
    const response = expectOk(await harness.useCase({ actor: actorFactory() }));
    expect(response.storageKey.length).toBeGreaterThan(0);
    expect(response.uploadUrl.length).toBeGreaterThan(0);
    expect(response.expiresInSeconds).toBeGreaterThan(0);
  });

  it("does not persist anything", async () => {
    await harness.useCase({ actor: actorFactory() });
    expect(harness.fileStore.savedKeys).toEqual([]);
  });

  it("asks the permissions port before acting", async () => {
    await harness.useCase({ actor: actorFactory() });
    expect(harness.permissions.requests.map((request) => request.action)).toEqual(["documents:upload"]);
  });

  it("refuses an actor without the upload permission", async () => {
    const denied = harnessFactory([]);
    const result = await denied.useCase({ actor: actorFactory() });
    if (isOk(result)) throw new Error("Expected the request to be rejected");
    expect(result.error.kind).toBe("forbidden");
  });
});
