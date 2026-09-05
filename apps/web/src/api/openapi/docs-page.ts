import type { HttpMethod } from "../route-definition";
import type { JsonSchema, OpenApiDocument, OpenApiOperation } from "./document";

const escapeMap: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (character) => escapeMap[character] ?? character);
}

function pretty(schema: JsonSchema | undefined): string {
  return escape(JSON.stringify(schema ?? {}, null, 2));
}

function resolve(document: OpenApiDocument, schema: JsonSchema): JsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  const name = ref.slice(ref.lastIndexOf("/") + 1);
  return document.components.schemas[name] ?? schema;
}

function styles(): string {
  return `
:root {
  color-scheme: light dark;
  --ink: #17201f;
  --paper: #f6f4ee;
  --rule: #c9c4b6;
  --muted: #6b6a62;
  --accent: #044ab3;
  --code: #ebe8df;
}
@media (prefers-color-scheme: dark) {
  :root { --ink: #ebe8df; --paper: #15171a; --rule: #3a3d42; --muted: #9a9b93; --accent: #7aa7ff; --code: #1e2126; }
}
* { box-sizing: border-box; }
html { background: var(--paper); color: var(--ink); }
body {
  margin: 0;
  font: 15px/1.55 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  padding: clamp(24px, 6vw, 96px) clamp(16px, 8vw, 160px) 20vh;
  max-width: 1120px;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
header h1 { font-size: clamp(28px, 4vw, 44px); font-weight: 500; letter-spacing: -0.02em; margin: 0 0 4px; }
header p { margin: 0; color: var(--muted); }
nav { margin: 48px 0 64px; border-top: 1px solid var(--rule); }
nav a { display: grid; grid-template-columns: 6ch 1fr auto; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--rule); color: inherit; }
nav a span:last-child { color: var(--muted); }
.method { color: var(--accent); text-transform: uppercase; font-weight: 600; }
section { margin: 0 0 96px; }
section h2 { font-size: clamp(20px, 2.4vw, 28px); font-weight: 500; margin: 0 0 4px; display: flex; gap: 16px; align-items: baseline; }
section > p { margin: 0 0 24px; color: var(--muted); }
dl { display: grid; grid-template-columns: 18ch 1fr; row-gap: 6px; column-gap: 16px; margin: 0 0 32px; padding: 0; }
dt { color: var(--muted); }
dd { margin: 0; }
h3 { font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 32px 0 8px; }
pre { background: var(--code); padding: 16px 20px; overflow-x: auto; margin: 0; font-size: 13px; line-height: 1.5; }
table { border-collapse: collapse; width: 100%; }
td { padding: 6px 12px 6px 0; vertical-align: top; border-bottom: 1px solid var(--rule); }
td:first-child { white-space: nowrap; width: 8ch; color: var(--accent); }
footer { margin-top: 96px; color: var(--muted); border-top: 1px solid var(--rule); padding-top: 16px; }
`;
}

function parameterRows(operation: OpenApiOperation): string {
  if (operation.parameters.length === 0) return "";
  const rows = operation.parameters
    .map(
      (parameter) =>
        `<tr><td>${escape(parameter.in)}</td><td>${escape(parameter.name)}${parameter.required ? "" : " (optional)"}</td><td>${escape(parameter.description)}</td></tr>`,
    )
    .join("");
  return `<h3>Parameters</h3><table>${rows}</table>`;
}

function requestBodyBlock(document: OpenApiDocument, operation: OpenApiOperation): string {
  const schema = operation.requestBody?.content["application/json"]?.schema;
  if (schema === undefined) return "";
  return `<h3>Request body</h3><pre>${pretty(resolve(document, schema))}</pre>`;
}

function responsesBlock(document: OpenApiDocument, operation: OpenApiOperation): string {
  const entries = Object.entries(operation.responses);
  const success = entries.find(([status]) => status.startsWith("2"));
  const successSchema = success?.[1].content?.["application/json"]?.schema;
  const successBlock =
    success === undefined
      ? ""
      : `<h3>Response ${escape(success[0])}</h3><pre>${pretty(successSchema === undefined ? undefined : resolve(document, successSchema))}</pre>`;
  const errorRows = entries
    .filter(([status]) => !status.startsWith("2"))
    .map(([status, response]) => `<tr><td>${escape(status)}</td><td>${escape(response.description)}</td></tr>`)
    .join("");
  return `${successBlock}<h3>Errors</h3><table>${errorRows}</table>`;
}

function security(operation: OpenApiOperation): string {
  if (operation.security.length === 0) return "public";
  return operation.security.map((scheme) => Object.keys(scheme).join(", ")).join(" or ");
}

function operationSection(document: OpenApiDocument, path: string, method: HttpMethod, operation: OpenApiOperation): string {
  return `
<section id="${escape(operation.operationId)}">
  <h2><span class="method">${escape(method)}</span><span>${escape(document.servers[0]?.url ?? "")}${escape(path)}</span></h2>
  <p>${escape(operation.summary)} · ${escape(operation.operationId)}</p>
  <dl>
    <dt>auth</dt><dd>${escape(security(operation))}</dd>
    <dt>human check</dt><dd>${operation["x-human-check"] ? "required" : "no"}</dd>
    <dt>idempotent</dt><dd>${operation["x-idempotent"] ? "yes, by Idempotency-Key" : "no"}</dd>
    <dt>rate limit bucket</dt><dd>${escape(operation["x-rate-limit-bucket"])}</dd>
    <dt>error codes</dt><dd>${operation["x-error-codes"].map(escape).join(", ") || "none declared"}</dd>
  </dl>
  ${parameterRows(operation)}
  ${requestBodyBlock(document, operation)}
  ${responsesBlock(document, operation)}
</section>`;
}

type Listed = { readonly path: string; readonly method: HttpMethod; readonly operation: OpenApiOperation };

function listed(document: OpenApiDocument): readonly Listed[] {
  const all: Listed[] = [];
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      all.push({ path, method: method as HttpMethod, operation });
    }
  }
  return all;
}

export function renderDocsPage(document: OpenApiDocument, nonce: string, openApiHref: string): string {
  const operations = listed(document);
  const index = operations
    .map(
      ({ path, method, operation }) =>
        `<a href="#${escape(operation.operationId)}"><span class="method">${escape(method)}</span><span>${escape(path)}</span><span>${escape(operation.summary)}</span></a>`,
    )
    .join("");
  const sections = operations.map(({ path, method, operation }) => operationSection(document, path, method, operation)).join("");
  const envelope = document.components.schemas.ErrorEnvelope;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(document.info.title)} ${escape(document.info.version)}</title>
<style nonce="${escape(nonce)}">${styles()}</style>
</head>
<body>
<header>
  <h1>${escape(document.info.title)}</h1>
  <p>version ${escape(document.info.version)} · <a href="${escape(openApiHref)}">openapi.json</a></p>
</header>
<nav>${index}</nav>
${sections}
<section id="errors">
  <h2>Error envelope</h2>
  <p>${escape(document.info.description)}</p>
  <pre>${pretty(envelope)}</pre>
</section>
<footer>Generated from the contracts. Rendered on the server; no scripts.</footer>
</body>
</html>`;
}
