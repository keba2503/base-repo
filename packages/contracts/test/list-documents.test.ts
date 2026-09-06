import { describe, expect, it } from "bun:test";
import { listDocumentsContract, parseContractInput } from "../src/index";

describe("list documents contract metadata", () => {
  it("accepts a session or an api key", () => {
    expect(listDocumentsContract.metadata.auth).toBe("either");
  });

  it("declares its rate limit bucket", () => {
    expect(listDocumentsContract.metadata.rateLimit).toBe("documents-read");
  });
});

describe("list documents input", () => {
  it("defaults the limit when absent", () => {
    const parsed = parseContractInput(listDocumentsContract, {});
    expect(parsed).toEqual({ kind: "valid", input: { limit: 20 } });
  });

  it("coerces a string limit from a query string", () => {
    const parsed = parseContractInput(listDocumentsContract, { limit: "5" });
    expect(parsed).toEqual({ kind: "valid", input: { limit: 5 } });
  });

  it("rejects a limit over the maximum", () => {
    const parsed = parseContractInput(listDocumentsContract, { limit: "1000" });
    expect(parsed.kind).toBe("invalid");
  });
});
