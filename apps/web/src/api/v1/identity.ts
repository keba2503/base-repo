import type { Outcome } from "@base/adapters";
import {
  createApiKeyContract,
  revokeApiKeyContract,
  type CreateApiKeyOutput,
  type RevokeApiKeyOutput,
} from "@base/contracts";
import type { ApiControllers } from "../dependencies";
import type { RouteDefinition } from "../route-definition";

type CreateApiKeyResponse = Extract<Awaited<ReturnType<ApiControllers["createApiKey"]>>, { kind: "ok" }>["value"];
type RevokeApiKeyResponse = Extract<Awaited<ReturnType<ApiControllers["revokeApiKey"]>>, { kind: "ok" }>["value"];

function toCreateApiKeyOutput(response: CreateApiKeyResponse): CreateApiKeyOutput {
  return {
    id: response.id,
    name: response.name,
    keyPrefix: response.keyPrefix,
    scopes: response.scopes as CreateApiKeyOutput["scopes"],
    createdAt: response.createdAt.toISOString(),
    plaintextKey: response.plaintextKey,
  };
}

function toRevokeApiKeyOutput(response: RevokeApiKeyResponse): RevokeApiKeyOutput {
  if (response.revokedAt === null) {
    throw new Error("A successful revocation must carry a revocation date");
  }
  return {
    id: response.id,
    name: response.name,
    keyPrefix: response.keyPrefix,
    scopes: response.scopes as RevokeApiKeyOutput["scopes"],
    createdAt: response.createdAt.toISOString(),
    revokedAt: response.revokedAt.toISOString(),
  };
}

function createdSerialised(outcome: Outcome<CreateApiKeyResponse>): Outcome<CreateApiKeyOutput> {
  if (outcome.kind !== "ok") return outcome;
  return { kind: "ok", value: toCreateApiKeyOutput(outcome.value) };
}

function revokedSerialised(outcome: Outcome<RevokeApiKeyResponse>): Outcome<RevokeApiKeyOutput> {
  if (outcome.kind !== "ok") return outcome;
  return { kind: "ok", value: toRevokeApiKeyOutput(outcome.value) };
}

export function identityRoutes(controllers: ApiControllers): readonly RouteDefinition[] {
  return [
    {
      operationId: "createApiKey",
      summary: "Create an api key",
      tag: "identity",
      method: "post",
      path: "/v1/api-keys",
      contract: createApiKeyContract,
      inputLocation: "body",
      successStatus: 201,
      execute: async ({ actor, payload }) => createdSerialised(await controllers.createApiKey({ actor, payload })),
    },
    {
      operationId: "revokeApiKey",
      summary: "Revoke an api key",
      tag: "identity",
      method: "post",
      path: "/v1/api-keys/revoke",
      contract: revokeApiKeyContract,
      inputLocation: "body",
      successStatus: 200,
      execute: async ({ actor, payload }) => revokedSerialised(await controllers.revokeApiKey({ actor, payload })),
    },
  ];
}
