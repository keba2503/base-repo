import { describe, expect, it } from "bun:test";
import type { ListDocuments } from "@base/application";
import { err, forbidden, ok } from "@base/domain";
import { listDocumentsController } from "../src/index";
import { actorFactory } from "./factories/actor";
import { documentResponseFactory } from "./factories/document-response";

describe("list documents controller", () => {
  it("returns the response model on success", async () => {
    const useCase: ListDocuments = () => Promise.resolve(ok({ documents: [documentResponseFactory()] }));
    const outcome = await listDocumentsController(useCase)({ actor: actorFactory(), limit: 10 });
    expect(outcome).toEqual({ kind: "ok", value: { documents: [documentResponseFactory()] } });
  });

  it("maps a forbidden domain error to a forbidden outcome", async () => {
    const useCase: ListDocuments = () => Promise.resolve(err(forbidden("authorization.denied", "denied")));
    const outcome = await listDocumentsController(useCase)({ actor: actorFactory(), limit: 10 });
    expect(outcome.kind).toBe("forbidden");
  });
});
