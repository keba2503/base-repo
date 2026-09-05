import { createRouteHandlers } from "@/api";
import { apiDependencies } from "@/main/api";

const handlers = createRouteHandlers(apiDependencies());

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
