import { describe, expect, it } from "bun:test";
import type { OpenApiDocument } from "@/api";
import { harnessFactory } from "./harness";

async function documentOf(): Promise<OpenApiDocument> {
  const response = await harnessFactory().api.request("/api/openapi.json");
  return response.json();
}

describe("GET /api/openapi.json", () => {
  it("answers 200 as JSON without credentials", async () => {
    const response = await harnessFactory().api.request("/api/openapi.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("declares OpenAPI 3.1 with the configured info and server", async () => {
    const document = await documentOf();
    expect(document.openapi).toBe("3.1.0");
    expect(document.info).toEqual(expect.objectContaining({ title: "Test API", version: "0.0.1" }));
    expect(document.servers).toEqual([{ url: "/api" }]);
  });

  it("declares a bearer api key scheme and a session cookie scheme", async () => {
    const document = await documentOf();
    expect(document.components.securitySchemes.apiKey).toEqual({ type: "http", scheme: "bearer", bearerFormat: "API key" });
    expect(document.components.securitySchemes.session).toEqual({ type: "apiKey", in: "cookie", name: "session" });
  });

  it("lists both tenant operations", async () => {
    const document = await documentOf();
    expect(document.paths["/v1/tenants"]?.post?.operationId).toBe("createTenant");
    expect(document.paths["/v1/tenants/{slug}"]?.get?.operationId).toBe("getTenantBySlug");
  });

  it("derives the request body schema from the contract input", async () => {
    const document = await documentOf();
    expect(document.paths["/v1/tenants"]?.post?.requestBody?.content["application/json"]?.schema).toEqual({
      $ref: "#/components/schemas/CreateTenantInput",
    });
    expect(document.components.schemas.CreateTenantInput).toEqual(
      expect.objectContaining({ type: "object", required: ["name", "slug"] }),
    );
  });

  it("derives path parameters from the contract input", async () => {
    const document = await documentOf();
    const parameters = document.paths["/v1/tenants/{slug}"]?.get?.parameters ?? [];
    expect(parameters.find((parameter) => parameter.in === "path")).toEqual(
      expect.objectContaining({ name: "slug", required: true }),
    );
  });

  it("documents the idempotency header on idempotent writes only", async () => {
    const document = await documentOf();
    const names = (operation: { parameters: readonly { name: string }[] } | undefined) =>
      operation?.parameters.map((parameter) => parameter.name) ?? [];
    expect(names(document.paths["/v1/tenants"]?.post)).toContain("Idempotency-Key");
    expect(names(document.paths["/v1/tenants/{slug}"]?.get)).not.toContain("Idempotency-Key");
  });

  it("maps contract auth to security requirements", async () => {
    const document = await documentOf();
    expect(document.paths["/v1/tenants"]?.post?.security).toEqual([{ session: [] }]);
    expect(document.paths["/v1/tenants/{slug}"]?.get?.security).toEqual([{ session: [] }, { apiKey: [] }]);
  });

  it("points every error response at the shared envelope", async () => {
    const document = await documentOf();
    const responses = document.paths["/v1/tenants"]?.post?.responses ?? {};
    const errorRefs = Object.entries(responses)
      .filter(([status]) => !status.startsWith("2"))
      .map(([, response]) => response.content?.["application/json"]?.schema);
    expect(errorRefs.length).toBeGreaterThan(0);
    expect(errorRefs.every((schema) => schema?.$ref === "#/components/schemas/ErrorEnvelope")).toBe(true);
  });

  it("exposes the contract metadata as extensions", async () => {
    const document = await documentOf();
    expect(document.paths["/v1/tenants"]?.post).toEqual(
      expect.objectContaining({ "x-idempotent": true, "x-rate-limit-bucket": "tenants-write", "x-auth": "session" }),
    );
  });
});

describe("GET /api/docs", () => {
  it("serves an HTML page without scripts", async () => {
    const response = await harnessFactory().api.request("/api/docs");
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).not.toContain("<script");
  });

  it("lists every operation and links the JSON document", async () => {
    const html = await (await harnessFactory().api.request("/api/docs")).text();
    expect(html).toContain("createTenant");
    expect(html).toContain("getTenantBySlug");
    expect(html).toContain('href="/api/openapi.json"');
  });

  it("locks itself down with a nonce based policy", async () => {
    const response = await harnessFactory().api.request("/api/docs");
    const policy = response.headers.get("Content-Security-Policy") ?? "";
    const html = await response.text();
    const nonce = /style-src 'nonce-([^']+)'/.exec(policy)?.[1];
    expect(policy).toContain("default-src 'none'");
    expect(nonce).toBeDefined();
    expect(html).toContain(`<style nonce="${nonce ?? ""}">`);
  });

  it("escapes what it renders", async () => {
    const harness = harnessFactory();
    const html = await (await harness.api.request("/api/docs")).text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;type&quot;: &quot;object&quot;");
  });
});
