import { describe, expect, it } from "bun:test";
import type { CreateDocumentUpload } from "@base/application";
import { err, forbidden, ok } from "@base/domain";
import { createDocumentUploadController } from "../src/index";
import { actorFactory } from "./factories/actor";

const response = { storageKey: "00000000-0000-4000-8000-000000000001", uploadUrl: "https://storage.example.com/upload/signed", expiresInSeconds: 300 };

describe("create document upload controller", () => {
  it("returns the response model on success", async () => {
    const useCase: CreateDocumentUpload = () => Promise.resolve(ok(response));
    const outcome = await createDocumentUploadController(useCase)({ actor: actorFactory(), payload: {} });
    expect(outcome).toEqual({ kind: "ok", value: response });
  });

  it("maps a forbidden domain error to a forbidden outcome", async () => {
    const useCase: CreateDocumentUpload = () => Promise.resolve(err(forbidden("authorization.denied", "denied")));
    const outcome = await createDocumentUploadController(useCase)({ actor: actorFactory(), payload: {} });
    expect(outcome.kind).toBe("forbidden");
  });
});
