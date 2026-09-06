import { describe, expect, it } from "bun:test";
import type { ConfirmDocumentUpload } from "@base/application";
import { err, notFound, ok } from "@base/domain";
import { confirmDocumentUploadController } from "../src/index";
import { actorFactory } from "./factories/actor";
import { documentResponseFactory } from "./factories/document-response";

const validPayload = { storageKey: "00000000-0000-4000-8000-000000000001", filename: "informe.pdf" };

function controllerOver(useCase: ConfirmDocumentUpload) {
  return confirmDocumentUploadController(useCase);
}

const succeedingUseCase: ConfirmDocumentUpload = () => Promise.resolve(ok(documentResponseFactory()));

describe("confirm document upload controller", () => {
  it("returns the response model on success", async () => {
    const outcome = await controllerOver(succeedingUseCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome).toEqual({ kind: "ok", value: documentResponseFactory() });
  });

  it("hands the parsed input to the use case", async () => {
    const seen: unknown[] = [];
    const useCase: ConfirmDocumentUpload = (request) => {
      seen.push({ storageKey: request.storageKey, filename: request.filename });
      return Promise.resolve(ok(documentResponseFactory()));
    };
    await controllerOver(useCase)({ actor: actorFactory(), payload: { ...validPayload, filename: "  informe.pdf  " } });
    expect(seen).toEqual([validPayload]);
  });

  it("never reaches the use case with an invalid payload", async () => {
    let calls = 0;
    const useCase: ConfirmDocumentUpload = () => {
      calls += 1;
      return Promise.resolve(ok(documentResponseFactory()));
    };
    await controllerOver(useCase)({ actor: actorFactory(), payload: { storageKey: "not-a-uuid", filename: "a.pdf" } });
    expect(calls).toBe(0);
  });

  it("maps a not found domain error to a not found outcome", async () => {
    const useCase: ConfirmDocumentUpload = () => Promise.resolve(err(notFound("document.upload.notFound", "missing")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("notFound");
  });
});
