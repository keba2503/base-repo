import { describe, expect, it } from "bun:test";
import { getDocumentContract, parseContractInput } from "../src/index";

describe("get document contract metadata", () => {
  it("accepts a session or an api key", () => {
    expect(getDocumentContract.metadata.auth).toBe("either");
  });

  it("declares its rate limit bucket", () => {
    expect(getDocumentContract.metadata.rateLimit).toBe("documents-read");
  });
});

describe("get document input", () => {
  it("accepts a valid document id", () => {
    const parsed = parseContractInput(getDocumentContract, { documentId: "00000000-0000-4000-8000-000000000001" });
    expect(parsed).toEqual({ kind: "valid", input: { documentId: "00000000-0000-4000-8000-000000000001" } });
  });

  it("rejects a document id that is not a uuid", () => {
    const parsed = parseContractInput(getDocumentContract, { documentId: "not-a-uuid" });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["documentId"]);
  });
});
