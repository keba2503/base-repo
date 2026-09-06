import { createRouteHandlers, type RouteHandlers } from "@/api";
import { apiDependencies } from "@/main/api";

let handlers: RouteHandlers | undefined;

function handlerFor(method: keyof RouteHandlers): (request: Request) => Promise<Response> {
  return (request) => {
    handlers ??= createRouteHandlers(apiDependencies());
    return handlers[method](request);
  };
}

export const GET = handlerFor("GET");
export const POST = handlerFor("POST");
export const PUT = handlerFor("PUT");
export const PATCH = handlerFor("PATCH");
export const DELETE = handlerFor("DELETE");
