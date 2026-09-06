import { describe, expect, it } from "bun:test";
import { confirmDocumentUploadContract, parseContractInput } from "../src/index";

const validPayload = { storageKey: "00000000-0000-4000-8000-000000000001", filename: "informe.pdf" };

describe("confirm document upload contract metadata", () => {
  it("accepts a session or an api key", () => {
    expect(confirmDocumentUploadContract.metadata.auth).toBe("either");
  });

  it("accepts an idempotency key", () => {
    expect(confirmDocumentUploadContract.metadata.idempotent).toBe(true);
  });

  it("declares its rate limit bucket", () => {
    expect(confirmDocumentUploadContract.metadata.rateLimit).toBe("documents-write");
  });
});

describe("confirm document upload input", () => {
  it("accepts a valid payload", () => {
    const parsed = parseContractInput(confirmDocumentUploadContract, validPayload);
    expect(parsed).toEqual({ kind: "valid", input: validPayload });
  });

  it("trims the filename", () => {
    const parsed = parseContractInput(confirmDocumentUploadContract, { ...validPayload, filename: "  informe.pdf  " });
    if (parsed.kind !== "valid") throw new Error("Expected a valid payload");
    expect(parsed.input.filename).toBe("informe.pdf");
  });

  it("rejects a storage key that is not a uuid", () => {
    const parsed = parseContractInput(confirmDocumentUploadContract, { ...validPayload, storageKey: "not-a-uuid" });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["storageKey"]);
  });

  it("rejects a missing filename", () => {
    const parsed = parseContractInput(confirmDocumentUploadContract, { storageKey: validPayload.storageKey });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["filename"]);
  });
});
