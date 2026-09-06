import { Hono } from "hono";
import type { ApiDependencies } from "./dependencies";
import { failureResponse } from "./failure";
import { buildOpenApiDocument } from "./openapi/document";
import { renderDocsPage } from "./openapi/docs-page";
import { requestIdHeader, requestIdOf } from "./request-id";
import { honoPathOf, type RouteDefinition } from "./route-definition";
import { routeHandler, type ApiEnvironment } from "./route-handler";
import { identityRoutes } from "./v1/identity";
import { tenantRoutes } from "./v1/tenants";

export const apiBasePath = "/api";
export const openApiPath = "/openapi.json";
export const docsPath = "/docs";

export type Api = Hono<ApiEnvironment>;

export function defaultRoutes(dependencies: ApiDependencies): readonly RouteDefinition[] {
  return [...tenantRoutes(dependencies.controllers), ...identityRoutes(dependencies.controllers)];
}

function docsContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function createApi(
  dependencies: ApiDependencies,
  routes: readonly RouteDefinition[] = defaultRoutes(dependencies),
): Api {
  const app = new Hono<ApiEnvironment>().basePath(apiBasePath);
  const document = buildOpenApiDocument(routes, dependencies.documentation);

  app.use("*", async (context, next) => {
    context.set("requestId", requestIdOf(context.req.raw));
    await next();
    context.res.headers.set(requestIdHeader, context.get("requestId"));
  });

  app.onError((error, context) => {
    const requestId = context.get("requestId");
    dependencies.logger.error("api request failed", {
      requestId,
      method: context.req.method,
      path: context.req.path,
      error: error.message,
    });
    return failureResponse({ status: 500, code: "internal.error", message: "The request could not be completed" }, requestId);
  });

  app.notFound((context) =>
    failureResponse(
      { status: 404, code: "route.notFound", message: `No operation answers ${context.req.method} ${context.req.path}` },
      context.get("requestId"),
    ),
  );

  app.get(openApiPath, (context) => context.json(document));

  app.get(docsPath, (context) => {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const html = renderDocsPage(document, nonce, `${apiBasePath}${openApiPath}`);
    context.header("Content-Security-Policy", docsContentSecurityPolicy(nonce));
    return context.html(html);
  });

  for (const route of routes) {
    app.on(route.method.toUpperCase(), honoPathOf(route.path), routeHandler(route, dependencies));
  }

  return app;
}

export type RouteHandlers = Readonly<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", (request: Request) => Promise<Response>>>;

export function createRouteHandlers(dependencies: ApiDependencies): RouteHandlers {
  const app = createApi(dependencies);
  const handle = (request: Request): Promise<Response> => Promise.resolve(app.fetch(request));
  return { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle };
}
