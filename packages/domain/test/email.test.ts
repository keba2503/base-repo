import { describe, expect, it } from "bun:test";
import { isErr, isOk } from "../src/kernel/result";
import { parseEmail } from "../src/identity/email";

function failureCode(value: string): string {
  const result = parseEmail(value);
  if (isOk(result)) throw new Error("Expected the email to be rejected");
  return result.error.code;
}

describe("email", () => {
  it("accepts a plain address", () => {
    expect(isOk(parseEmail("karen@example.com"))).toBe(true);
  });

  it("normalises case and surrounding whitespace", () => {
    const result = parseEmail("  Karen@Example.COM ");
    if (!isOk(result)) throw new Error("Expected the email to be accepted");
    expect(String(result.value)).toBe("karen@example.com");
  });

  it("accepts a subdomain and a plus tag", () => {
    expect(isOk(parseEmail("karen+ops@mail.example.co.uk"))).toBe(true);
  });

  it("rejects an empty value", () => {
    expect(failureCode("   ")).toBe("email.length");
  });

  it("rejects a value longer than 254 characters", () => {
    expect(failureCode(`${"a".repeat(250)}@example.com`)).toBe("email.length");
  });

  it("rejects a missing at sign", () => {
    expect(failureCode("karen.example.com")).toBe("email.format");
  });

  it("rejects a domain without a dot", () => {
    expect(failureCode("karen@localhost")).toBe("email.format");
  });

  it("rejects consecutive dots", () => {
    expect(isErr(parseEmail("karen..b@example.com"))).toBe(true);
  });
});
