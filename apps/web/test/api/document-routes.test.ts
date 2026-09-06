import { describe, expect, it } from "bun:test";
import {
  documentOutput,
  domainError,
  errorOf,
  getDocumentByPath,
  getDocuments,
  harnessFactory,
  postDocument,
  validUploadDocumentPayload,
} from "./harness";

describe("POST /api/v1/documents", () => {
  it("answers 201 with the contract output on success", async () => {
    const response = await postDocument(harnessFactory().api, validUploadDocumentPayload);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(documentOutput);
  });

  it("answers 422 with the issues when the payload breaks the contract", async () => {
    const response = await postDocument(harnessFactory().api, { content: validUploadDocumentPayload.content });
    const error = await errorOf(response);
    expect(response.status).toBe(422);
    expect(error.issues).toEqual([expect.objectContaining({ path: "filename" })]);
  });

  it("answers 422 carrying the domain code when the content type is unsupported", async () => {
    const harness = harnessFactory({
      uploadDocument: () =>
        Promise.resolve(domainError("invariantViolation", "document.contentType.unsupported", "unsupported")),
    });
    const response = await postDocument(harness.api, validUploadDocumentPayload);
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("document.contentType.unsupported");
  });

  it("answers 403 when the use case forbids the actor", async () => {
    const harness = harnessFactory({
      uploadDocument: () => Promise.resolve(domainError("forbidden", "authorization.denied", "denied")),
    });
    const response = await postDocument(harness.api, validUploadDocumentPayload);
    expect(response.status).toBe(403);
  });
});

describe("GET /api/v1/documents/{documentId}", () => {
  it("answers 200 with the contract output on success", async () => {
    const response = await getDocumentByPath(harnessFactory().api, documentOutput.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(documentOutput);
  });

  it("answers 404 when the document does not exist", async () => {
    const harness = harnessFactory({
      getDocument: () => Promise.resolve(domainError("notFound", "document.notFound", "missing")),
    });
    const response = await getDocumentByPath(harness.api, "00000000-0000-4000-8000-000000000099");
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("document.notFound");
  });

  it("answers 422 when the document id is not a uuid", async () => {
    let calls = 0;
    const harness = harnessFactory({
      getDocument: () => {
        calls += 1;
        return Promise.resolve(domainError("notFound", "document.notFound", "missing"));
      },
    });
    const response = await getDocumentByPath(harness.api, "not-a-uuid");
    expect(response.status).toBe(422);
    expect(calls).toBe(0);
  });
});

describe("GET /api/v1/documents", () => {
  it("answers 200 with the documents list", async () => {
    const response = await getDocuments(harnessFactory().api);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ documents: [documentOutput] });
  });

  it("defaults the limit when it is absent from the query", async () => {
    const seen: unknown[] = [];
    const harness = harnessFactory({
      listDocuments: (request) => {
        seen.push(request.limit);
        return Promise.resolve({ kind: "ok", value: { documents: [] } });
      },
    });
    await getDocuments(harness.api);
    expect(seen).toEqual([20]);
  });

  it("coerces a numeric limit from the query string", async () => {
    const seen: unknown[] = [];
    const harness = harnessFactory({
      listDocuments: (request) => {
        seen.push(request.limit);
        return Promise.resolve({ kind: "ok", value: { documents: [] } });
      },
    });
    await getDocuments(harness.api, "?limit=5");
    expect(seen).toEqual([5]);
  });

  it("answers 403 when the use case forbids the actor", async () => {
    const harness = harnessFactory({
      listDocuments: () => Promise.resolve(domainError("forbidden", "authorization.denied", "denied")),
    });
    const response = await getDocuments(harness.api);
    expect(response.status).toBe(403);
  });
});
