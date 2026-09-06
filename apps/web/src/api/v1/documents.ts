import type { Outcome } from "@base/adapters";
import {
  confirmDocumentUploadContract,
  createDocumentUploadContract,
  getDocumentContract,
  listDocumentsContract,
  parseContractInput,
  type DocumentOutput,
  type ListDocumentsOutput,
} from "@base/contracts";
import type { DocumentControllers } from "../dependencies";
import type { RouteDefinition } from "../route-definition";

type DocumentResponse = Extract<Awaited<ReturnType<DocumentControllers["getDocument"]>>, { kind: "ok" }>["value"];
type ListDocumentsResponse = Extract<Awaited<ReturnType<DocumentControllers["listDocuments"]>>, { kind: "ok" }>["value"];

function toDocumentOutput(response: DocumentResponse): DocumentOutput {
  return {
    id: response.id,
    tenantId: response.tenantId,
    originalFilename: response.originalFilename,
    contentType: response.contentType,
    sizeBytes: response.sizeBytes,
    status: response.status as DocumentOutput["status"],
    extractedText: response.extractedText,
    failureReason: response.failureReason,
    createdAt: response.createdAt.toISOString(),
    processedAt: response.processedAt?.toISOString() ?? null,
  };
}

function toListDocumentsOutput(response: ListDocumentsResponse): ListDocumentsOutput {
  return { documents: response.documents.map(toDocumentOutput) };
}

function documentSerialised(outcome: Outcome<DocumentResponse>): Outcome<DocumentOutput> {
  if (outcome.kind !== "ok") return outcome;
  return { kind: "ok", value: toDocumentOutput(outcome.value) };
}

function listSerialised(outcome: Outcome<ListDocumentsResponse>): Outcome<ListDocumentsOutput> {
  if (outcome.kind !== "ok") return outcome;
  return { kind: "ok", value: toListDocumentsOutput(outcome.value) };
}

export function documentRoutes(controllers: DocumentControllers): readonly RouteDefinition[] {
  return [
    {
      operationId: "createDocumentUploadUrl",
      summary: "Request a signed url to upload a document directly to storage",
      tag: "documents",
      method: "post",
      path: "/v1/documents/upload-urls",
      contract: createDocumentUploadContract,
      inputLocation: "body",
      successStatus: 200,
      execute: async ({ actor, payload }) => controllers.createDocumentUpload({ actor, payload }),
    },
    {
      operationId: "confirmDocumentUpload",
      summary: "Confirm a document already uploaded to storage and start processing it",
      tag: "documents",
      method: "post",
      path: "/v1/documents",
      contract: confirmDocumentUploadContract,
      inputLocation: "body",
      successStatus: 201,
      execute: async ({ actor, payload }) => documentSerialised(await controllers.confirmDocumentUpload({ actor, payload })),
    },
    {
      operationId: "getDocument",
      summary: "Get a document by id",
      tag: "documents",
      method: "get",
      path: "/v1/documents/{documentId}",
      contract: getDocumentContract,
      inputLocation: "path",
      successStatus: 200,
      execute: async ({ actor, payload }) => {
        const parsed = parseContractInput(getDocumentContract, payload);
        if (parsed.kind === "invalid") return { kind: "invalid", issues: parsed.issues };
        return documentSerialised(await controllers.getDocument({ actor, documentId: parsed.input.documentId }));
      },
    },
    {
      operationId: "listDocuments",
      summary: "List the tenant's documents",
      tag: "documents",
      method: "get",
      path: "/v1/documents",
      contract: listDocumentsContract,
      inputLocation: "query",
      successStatus: 200,
      execute: async ({ actor, payload }) => {
        const parsed = parseContractInput(listDocumentsContract, payload);
        if (parsed.kind === "invalid") return { kind: "invalid", issues: parsed.issues };
        return listSerialised(await controllers.listDocuments({ actor, limit: parsed.input.limit }));
      },
    },
  ];
}
