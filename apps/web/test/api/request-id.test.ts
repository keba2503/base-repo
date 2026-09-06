import { describe, expect, it } from "bun:test";
import { remoteAddressOf, requestIdOf } from "@/api/request-id";

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/v1/tenants", { headers });
}

describe("requestIdOf", () => {
  it("accepts a well formed request id from the caller", () => {
    expect(requestIdOf(requestWithHeaders({ "X-Request-Id": "abc-123" }))).toBe("abc-123");
  });

  it("generates a request id when the caller sends none", () => {
    expect(requestIdOf(requestWithHeaders({}))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("generates a request id when the caller sends a malformed one", () => {
    expect(requestIdOf(requestWithHeaders({ "X-Request-Id": "<script>" }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("remoteAddressOf", () => {
  it("trusts the platform header over the generic forwarded-for header", () => {
    const request = requestWithHeaders({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-forwarded-for": "198.51.100.1, 203.0.113.9",
    });
    expect(remoteAddressOf(request)).toBe("203.0.113.9");
  });

  it("falls back to the generic forwarded-for header without the platform header", () => {
    const request = requestWithHeaders({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" });
    expect(remoteAddressOf(request)).toBe("198.51.100.1");
  });

  it("falls back to x-real-ip without any forwarded-for header", () => {
    const request = requestWithHeaders({ "x-real-ip": "198.51.100.7" });
    expect(remoteAddressOf(request)).toBe("198.51.100.7");
  });

  it("reports unknown without any address header", () => {
    expect(remoteAddressOf(requestWithHeaders({}))).toBe("unknown");
  });
});
