import type { Outcome } from "@base/adapters";
import type { Contract } from "@base/contracts";
import type { Actor } from "./dependencies";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export type SuccessStatus = 200 | 201;

export type InputLocation = "body" | "path" | "query";

export type OperationCall = {
  readonly actor: Actor;
  readonly payload: unknown;
};

export type RouteDefinition = {
  readonly operationId: string;
  readonly summary: string;
  readonly tag: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly contract: Contract<unknown, unknown>;
  readonly inputLocation: InputLocation;
  readonly successStatus: SuccessStatus;
  readonly execute: (call: OperationCall) => Promise<Outcome<unknown>>;
};

export function honoPathOf(openApiPath: string): string {
  return openApiPath.replace(/\{([^}]+)\}/g, ":$1");
}
