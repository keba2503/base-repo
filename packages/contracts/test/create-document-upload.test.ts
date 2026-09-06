import { describe, expect, it } from "bun:test";
import { createDocumentUploadContract, parseContractInput } from "../src/index";

describe("create document upload contract metadata", () => {
  it("accepts a session or an api key", () => {
    expect(createDocumentUploadContract.metadata.auth).toBe("either");
  });

  it("declares its rate limit bucket", () => {
    expect(createDocumentUploadContract.metadata.rateLimit).toBe("documents-write");
  });
});

describe("create document upload input", () => {
  it("accepts an empty payload", () => {
    const parsed = parseContractInput(createDocumentUploadContract, {});
    expect(parsed).toEqual({ kind: "valid", input: {} });
  });
});

describe("create document upload output", () => {
  it("allows only the declared fields", () => {
    const parsed = createDocumentUploadContract.output.safeParse({
      storageKey: "00000000-0000-4000-8000-000000000001",
      uploadUrl: "https://storage.example.com/upload/signed",
      expiresInSeconds: 300,
      secret: "leaked",
    });
    if (!parsed.success) throw new Error("Expected a valid output");
    expect(Object.keys(parsed.data).sort()).toEqual(["storageKey", "uploadUrl", "expiresInSeconds"].sort());
  });
});
