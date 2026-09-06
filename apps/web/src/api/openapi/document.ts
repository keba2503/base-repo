import { z } from "zod";
import type { ApiDocumentation } from "../dependencies";
import { humanTokenHeader } from "../human-check";
import { idempotencyKeyHeader } from "../idempotency";
import { requestIdHeader } from "../request-id";
import type { HttpMethod, RouteDefinition } from "../route-definition";

export type JsonSchema = Readonly<Record<string, unknown>>;

export type OpenApiParameter = {
  readonly name: string;
  readonly in: "path" | "header";
  readonly required: boolean;
  readonly description: string;
  readonly schema: JsonSchema;
};

export type OpenApiResponse = {
  readonly description: string;
  readonly content?: Readonly<Record<string, { readonly schema: JsonSchema }>>;
};

export type OpenApiOperation = {
  readonly operationId: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly security: readonly Readonly<Record<string, readonly string[]>>[];
  readonly parameters: readonly OpenApiParameter[];
  readonly requestBody?: {
    readonly required: true;
    readonly content: Readonly<Record<string, { readonly schema: JsonSchema }>>;
  };
  readonly responses: Readonly<Record<string, OpenApiResponse>>;
  readonly "x-auth": string;
  readonly "x-human-check": boolean;
  readonly "x-idempotent": boolean;
  readonly "x-rate-limit-bucket": string;
  readonly "x-error-codes": readonly string[];
};

export type OpenApiDocument = {
  readonly openapi: "3.1.0";
  readonly info: { readonly title: string; readonly version: string; readonly description: string };
  readonly servers: readonly { readonly url: string }[];
  readonly tags: readonly { readonly name: string }[];
  readonly paths: Readonly<Record<string, Readonly<Partial<Record<HttpMethod, OpenApiOperation>>>>>;
  readonly components: {
    readonly securitySchemes: Readonly<Record<string, JsonSchema>>;
    readonly schemas: Readonly<Record<string, JsonSchema>>;
  };
};

export const apiKeySecurityScheme = "apiKey";
export const sessionSecurityScheme = "session";
export const errorEnvelopeSchemaName = "ErrorEnvelope";

const errorEnvelopeSchema: JsonSchema = {
  type: "object",
  required: ["error"],
  additionalProperties: false,
  properties: {
    error: {
      type: "object",
      required: ["code", "message", "requestId"],
      additionalProperties: false,
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        requestId: { type: "string" },
        issues: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "code", "message"],
            properties: { path: { type: "string" }, code: { type: "string" }, message: { type: "string" } },
          },
        },
      },
    },
  },
};

const errorDescriptions: Readonly<Record<number, string>> = {
  401: "Credentials missing, not accepted for this operation or not recognised",
  403: "The actor may not perform this operation, or the human check was rejected",
  404: "The resource does not exist inside the actor tenant",
  409: "The request conflicts with the current state",
  422: "The request does not satisfy the contract or the idempotency rules",
  429: "The rate limit bucket is exhausted; Retry-After tells when to try again",
  500: "Unexpected failure; the request id identifies it in the logs",
};

function jsonSchemaOf(schema: z.ZodType): JsonSchema {
  const generated: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  delete generated.$schema;
  return generated;
}

function propertiesOf(schema: JsonSchema): Readonly<Record<string, JsonSchema>> {
  const properties = schema.properties;
  if (typeof properties !== "object" || properties === null) return {};
  const named: Record<string, JsonSchema> = {};
  for (const [name, value] of Object.entries(properties)) {
    if (typeof value === "object" && value !== null) named[name] = value as JsonSchema;
  }
  return named;
}

function schemaNameOf(route: RouteDefinition, side: "Input" | "Output"): string {
  return `${route.operationId.charAt(0).toUpperCase()}${route.operationId.slice(1)}${side}`;
}

function reference(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

function securityOf(route: RouteDefinition): readonly Readonly<Record<string, readonly string[]>>[] {
  const { auth } = route.contract.metadata;
  if (auth === "public") return [];
  if (auth === "session") return [{ [sessionSecurityScheme]: [] }];
  if (auth === "apiKey") return [{ [apiKeySecurityScheme]: [] }];
  return [{ [sessionSecurityScheme]: [] }, { [apiKeySecurityScheme]: [] }];
}

function headerParameter(name: string, required: boolean, description: string): OpenApiParameter {
  return { name, in: "header", required, description, schema: { type: "string" } };
}

function parametersOf(route: RouteDefinition, inputSchema: JsonSchema): readonly OpenApiParameter[] {
  const { metadata } = route.contract;
  const pathParameters: OpenApiParameter[] =
    route.inputLocation === "path"
      ? Object.entries(propertiesOf(inputSchema)).map(([name, schema]) => ({
          name,
          in: "path",
          required: true,
          description: `The ${name} of the resource`,
          schema,
        }))
      : [];
  const headers: OpenApiParameter[] = [
    headerParameter(requestIdHeader, false, "Correlation id echoed back; generated when absent"),
  ];
  if (metadata.humanCheck) {
    headers.push(headerParameter(humanTokenHeader, true, "Proof issued by the human check widget"));
  }
  if (metadata.idempotent && route.inputLocation === "body") {
    headers.push(
      headerParameter(
        idempotencyKeyHeader,
        false,
        "Same key with the same payload replays the stored response; a different payload is refused with 422",
      ),
    );
  }
  return [...pathParameters, ...headers];
}

function errorStatusesOf(route: RouteDefinition): readonly number[] {
  const { metadata } = route.contract;
  const statuses = new Set<number>([422, 429, 500]);
  if (metadata.auth !== "public") {
    statuses.add(401);
    statuses.add(403);
  }
  if (metadata.humanCheck) statuses.add(403);
  if (route.inputLocation === "path") statuses.add(404);
  if (route.method !== "get") statuses.add(409);
  return [...statuses].sort((left, right) => left - right);
}

function responsesOf(route: RouteDefinition): Readonly<Record<string, OpenApiResponse>> {
  const responses: Record<string, OpenApiResponse> = {
    [String(route.successStatus)]: {
      description: route.successStatus === 201 ? "Created" : "OK",
      content: { "application/json": { schema: reference(schemaNameOf(route, "Output")) } },
    },
  };
  for (const status of errorStatusesOf(route)) {
    responses[String(status)] = {
      description: errorDescriptions[status] ?? "Error",
      content: { "application/json": { schema: reference(errorEnvelopeSchemaName) } },
    };
  }
  return responses;
}

function operationOf(route: RouteDefinition, inputSchema: JsonSchema): OpenApiOperation {
  const { metadata, errorCodes } = route.contract;
  const base = {
    operationId: route.operationId,
    summary: route.summary,
    tags: [route.tag],
    security: securityOf(route),
    parameters: parametersOf(route, inputSchema),
    responses: responsesOf(route),
    "x-auth": metadata.auth,
    "x-human-check": metadata.humanCheck,
    "x-idempotent": metadata.idempotent,
    "x-rate-limit-bucket": metadata.rateLimit,
    "x-error-codes": errorCodes,
  };
  if (route.inputLocation !== "body") return base;
  return {
    ...base,
    requestBody: {
      required: true,
      content: { "application/json": { schema: reference(schemaNameOf(route, "Input")) } },
    },
  };
}

export function buildOpenApiDocument(routes: readonly RouteDefinition[], documentation: ApiDocumentation): OpenApiDocument {
  const paths: Record<string, Partial<Record<HttpMethod, OpenApiOperation>>> = {};
  const schemas: Record<string, JsonSchema> = { [errorEnvelopeSchemaName]: errorEnvelopeSchema };
  const tags = new Set<string>();

  for (const route of routes) {
    const inputSchema = jsonSchemaOf(route.contract.input);
    schemas[schemaNameOf(route, "Input")] = inputSchema;
    schemas[schemaNameOf(route, "Output")] = jsonSchemaOf(route.contract.output);
    tags.add(route.tag);
    paths[route.path] = { ...paths[route.path], [route.method]: operationOf(route, inputSchema) };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: documentation.title,
      version: documentation.version,
      description: "Every error answers with { error: { code, message, requestId } }.",
    },
    servers: [{ url: documentation.serverUrl }],
    tags: [...tags].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        [apiKeySecurityScheme]: { type: "http", scheme: "bearer", bearerFormat: "API key" },
        [sessionSecurityScheme]: { type: "apiKey", in: "cookie", name: documentation.sessionCookieName },
      },
      schemas,
    },
  };
}
