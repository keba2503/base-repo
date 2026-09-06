import type { ApiKeyCreatedResponse, ApiKeyResponse } from "@base/application";

export function apiKeyResponseFactory(overrides: Partial<ApiKeyResponse> = {}): ApiKeyResponse {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    tenantId: "00000000-0000-4000-8000-000000000384",
    name: "Integration",
    keyPrefix: "ak_00000000000040008000000000000001",
    scopes: ["tenants:read", "apikeys:manage"],
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    revokedAt: null,
    ...overrides,
  };
}

export function apiKeyCreatedResponseFactory(
  overrides: Partial<ApiKeyCreatedResponse> = {},
): ApiKeyCreatedResponse {
  return {
    ...apiKeyResponseFactory(),
    plaintextKey: "ak_00000000000040008000000000000001.secret-1",
    ...overrides,
  };
}
