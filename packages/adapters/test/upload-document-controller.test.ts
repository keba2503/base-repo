import { describe, expect, it } from "bun:test";
import type { UploadDocument } from "@base/application";
import { err, forbidden, invariantViolation, ok } from "@base/domain";
import { uploadDocumentController } from "../src/index";
import { actorFactory } from "./factories/actor";
import { documentResponseFactory } from "./factories/document-response";

const validBase64 = Buffer.from("%PDF-1.7 fake pdf body").toString("base64");
const validPayload = { filename: "informe.pdf", content: validBase64 };

function controllerOver(useCase: UploadDocument) {
  return uploadDocumentController(useCase);
}

const succeedingUseCase: UploadDocument = () => Promise.resolve(ok(documentResponseFactory()));

describe("upload document controller", () => {
  it("returns the response model on success", async () => {
    const outcome = await controllerOver(succeedingUseCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome).toEqual({ kind: "ok", value: documentResponseFactory() });
  });

  it("hands the parsed input to the use case", async () => {
    const seen: unknown[] = [];
    const useCase: UploadDocument = (request) => {
      seen.push({ filename: request.filename, base64Content: request.base64Content });
      return Promise.resolve(ok(documentResponseFactory()));
    };
    await controllerOver(useCase)({ actor: actorFactory(), payload: { filename: "  informe.pdf  ", content: validBase64 } });
    expect(seen).toEqual([{ filename: "informe.pdf", base64Content: validBase64 }]);
  });

  it("never reaches the use case with an invalid payload", async () => {
    let calls = 0;
    const useCase: UploadDocument = () => {
      calls += 1;
      return Promise.resolve(ok(documentResponseFactory()));
    };
    await controllerOver(useCase)({ actor: actorFactory(), payload: { filename: "informe.pdf", content: "%%not-base64%%" } });
    expect(calls).toBe(0);
  });

  it("reports contract violations as invalid", async () => {
    const outcome = await controllerOver(succeedingUseCase)({ actor: actorFactory(), payload: { content: validBase64 } });
    if (outcome.kind !== "invalid") throw new Error("Expected an invalid outcome");
    expect(outcome.issues.map((issue) => issue.path)).toEqual(["filename"]);
  });

  it("maps a forbidden domain error to a forbidden outcome", async () => {
    const useCase: UploadDocument = () => Promise.resolve(err(forbidden("authorization.denied", "denied")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    expect(outcome.kind).toBe("forbidden");
  });

  it("maps an invariant violation to an invalid outcome carrying its code", async () => {
    const useCase: UploadDocument = () => Promise.resolve(err(invariantViolation("document.contentType.unsupported", "unsupported")));
    const outcome = await controllerOver(useCase)({ actor: actorFactory(), payload: validPayload });
    if (outcome.kind !== "invalid") throw new Error("Expected an invalid outcome");
    expect(outcome.issues.map((issue) => issue.code)).toEqual(["document.contentType.unsupported"]);
  });
});
