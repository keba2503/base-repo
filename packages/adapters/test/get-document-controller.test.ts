import { describe, expect, it } from "bun:test";
import type { GetDocument } from "@base/application";
import { err, notFound, ok } from "@base/domain";
import { getDocumentController } from "../src/index";
import { actorFactory } from "./factories/actor";
import { documentResponseFactory } from "./factories/document-response";

describe("get document controller", () => {
  it("returns the response model on success", async () => {
    const useCase: GetDocument = () => Promise.resolve(ok(documentResponseFactory()));
    const outcome = await getDocumentController(useCase)({ actor: actorFactory(), documentId: documentResponseFactory().id });
    expect(outcome).toEqual({ kind: "ok", value: documentResponseFactory() });
  });

  it("maps a not found domain error to a not found outcome", async () => {
    const useCase: GetDocument = () => Promise.resolve(err(notFound("document.notFound", "missing")));
    const outcome = await getDocumentController(useCase)({ actor: actorFactory(), documentId: "unknown" });
    expect(outcome.kind).toBe("notFound");
  });
});
