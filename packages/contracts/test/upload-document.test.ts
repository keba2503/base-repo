import { describe, expect, it } from "bun:test";
import { parseContractInput, uploadDocumentContract } from "../src/index";

const validBase64 = Buffer.from("%PDF-1.7 fake pdf body").toString("base64");

describe("upload document contract metadata", () => {
  it("accepts a session or an api key", () => {
    expect(uploadDocumentContract.metadata.auth).toBe("either");
  });

  it("does not require a human check", () => {
    expect(uploadDocumentContract.metadata.humanCheck).toBe(false);
  });

  it("accepts an idempotency key", () => {
    expect(uploadDocumentContract.metadata.idempotent).toBe(true);
  });

  it("declares its rate limit bucket", () => {
    expect(uploadDocumentContract.metadata.rateLimit).toBe("documents-write");
  });
});

describe("upload document input", () => {
  it("accepts a valid payload", () => {
    const parsed = parseContractInput(uploadDocumentContract, { filename: "informe.pdf", content: validBase64 });
    expect(parsed).toEqual({ kind: "valid", input: { filename: "informe.pdf", content: validBase64 } });
  });

  it("trims the filename", () => {
    const parsed = parseContractInput(uploadDocumentContract, { filename: "  informe.pdf  ", content: validBase64 });
    if (parsed.kind !== "valid") throw new Error("Expected a valid payload");
    expect(parsed.input.filename).toBe("informe.pdf");
  });

  it("rejects content that is not valid base64", () => {
    const parsed = parseContractInput(uploadDocumentContract, { filename: "informe.pdf", content: "%%not-base64%%" });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["content"]);
  });

  it("rejects a missing filename", () => {
    const parsed = parseContractInput(uploadDocumentContract, { content: validBase64 });
    if (parsed.kind !== "invalid") throw new Error("Expected an invalid payload");
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["filename"]);
  });
});

describe("upload document output", () => {
  it("allows only the declared fields", () => {
    const parsed = uploadDocumentContract.output.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      tenantId: "00000000-0000-4000-8000-000000000002",
      originalFilename: "informe.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      status: "pending",
      extractedText: null,
      failureReason: null,
      createdAt: "2026-01-15T10:00:00.000Z",
      processedAt: null,
      secret: "leaked",
    });
    if (!parsed.success) throw new Error("Expected a valid output");
    expect(Object.keys(parsed.data).sort()).toEqual(
      [
        "id",
        "tenantId",
        "originalFilename",
        "contentType",
        "sizeBytes",
        "status",
        "extractedText",
        "failureReason",
        "createdAt",
        "processedAt",
      ].sort(),
    );
  });
});
