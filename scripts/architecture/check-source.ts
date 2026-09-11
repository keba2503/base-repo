import * as ts from "typescript";
import { envAccessOnlyIn, layerByPackage, layerOf, type Layer } from "./layers";
import { decodedText } from "../utf8";

export type Issue = { file: string; line: number; rule: string; message: string };

const scriptExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];
const markupExtensions = [".css", ".md", ".mdx", ".html", ".svg", ".json", ".jsonc"];
const hashCommentExtensions = [".yml", ".yaml", ".sh", ".toml", ".env", ".gitignore", ".gitattributes"];
const hashCommentNames = [".gitignore", ".gitattributes", ".npmrc", "CODEOWNERS", ".env.example"];

function lineOf(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.slice(dot);
}

function scriptKind(ext: string): ts.ScriptKind {
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

const triviaTokens = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.WhitespaceTrivia,
  ts.SyntaxKind.NewLineTrivia,
  ts.SyntaxKind.SingleLineCommentTrivia,
  ts.SyntaxKind.MultiLineCommentTrivia,
  ts.SyntaxKind.ShebangTrivia,
  ts.SyntaxKind.ConflictMarkerTrivia,
]);

const tokensAfterWhichSlashIsDivision = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.ThisKeyword,
  ts.SyntaxKind.SuperKeyword,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.PlusPlusToken,
  ts.SyntaxKind.MinusMinusToken,
]);

function commentIssuesInScript(file: string, source: ts.SourceFile): Issue[] {
  const issues: Issue[] = [];
  const text = source.getFullText();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, source.languageVariant, text);
  const braceOpenedByTemplate: boolean[] = [];
  let previous: ts.SyntaxKind = ts.SyntaxKind.Unknown;
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      (token === ts.SyntaxKind.SlashToken || token === ts.SyntaxKind.SlashEqualsToken) &&
      !tokensAfterWhichSlashIsDivision.has(previous)
    ) {
      token = scanner.reScanSlashToken();
    }

    if (token === ts.SyntaxKind.TemplateHead) {
      braceOpenedByTemplate.push(true);
    } else if (token === ts.SyntaxKind.OpenBraceToken) {
      braceOpenedByTemplate.push(false);
    } else if (token === ts.SyntaxKind.CloseBraceToken && braceOpenedByTemplate.pop() === true) {
      token = scanner.reScanTemplateToken(false);
      if (token === ts.SyntaxKind.TemplateMiddle) braceOpenedByTemplate.push(true);
      previous = token;
      token = scanner.scan();
      continue;
    } else if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      const start = scanner.getTokenStart();
      const isTripleSlashDirective = text.startsWith("///", start);
      if (!isTripleSlashDirective) {
        issues.push({ file, line: lineOf(text, start), rule: "no-comments", message: "Comments are forbidden" });
      }
    }

    if (!triviaTokens.has(token)) previous = token;
    token = scanner.scan();
  }
  return issues;
}

function anyIssues(file: string, source: ts.SourceFile): Issue[] {
  const issues: Issue[] = [];
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      issues.push({ file, line: lineOf(source.getFullText(), node.getStart(source)), rule: "no-any", message: "The any type is forbidden" });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return issues;
}

function envIssues(file: string, source: ts.SourceFile): Issue[] {
  if (envAccessOnlyIn.some((dir) => file.startsWith(`${dir}/`))) return [];
  const issues: Issue[] = [];
  const text = source.getFullText();
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(source) === "process" && node.name.text === "env") {
      issues.push({ file, line: lineOf(text, node.getStart(source)), rule: "env-only-in-main", message: "process.env is only allowed inside the main directory" });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return issues;
}

function matchesPattern(specifier: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) return specifier.startsWith(pattern.slice(0, -1)) || specifier === pattern.slice(0, -2);
  return specifier === pattern || specifier.startsWith(`${pattern}/`);
}

function importSpecifiers(source: ts.SourceFile): { specifier: string; pos: number }[] {
  const found: { specifier: string; pos: number }[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, pos: node.getStart(source) });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      found.push({ specifier: node.arguments[0].text, pos: node.getStart(source) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function importIssues(file: string, layer: Layer, source: ts.SourceFile): Issue[] {
  const issues: Issue[] = [];
  const text = source.getFullText();
  const relativeInsideLayer = file.slice(layer.path.length + 1);
  for (const { specifier, pos } of importSpecifiers(source)) {
    const line = lineOf(text, pos);
    if (specifier.startsWith(".") || specifier.startsWith("@/")) continue;
    const target = layerByPackage(specifier);
    if (target) {
      if (target.name === layer.name) continue;
      const restricted = layer.mayImportOnlyFrom?.[target.name];
      if (restricted) {
        if (!restricted.some((dir) => relativeInsideLayer.startsWith(`${dir}/`))) {
          issues.push({ file, line, rule: "dependency-rule", message: `${layer.name} may import ${target.name} only from ${restricted.join(", ")}` });
        }
        continue;
      }
      if (!layer.mayImport.includes(target.name)) {
        issues.push({ file, line, rule: "dependency-rule", message: `${layer.name} must not import ${target.name}` });
      }
      continue;
    }
    if (layer.externalForbidden?.some((pattern) => matchesPattern(specifier, pattern))) {
      issues.push({ file, line, rule: "forbidden-external", message: `${layer.name} must not import ${specifier}` });
      continue;
    }
    if (layer.externalAllowed && !layer.externalAllowed.some((pattern) => matchesPattern(specifier, pattern))) {
      issues.push({ file, line, rule: "forbidden-external", message: layer.externalAllowed.length ? `${layer.name} may only import ${layer.externalAllowed.join(", ")}; found ${specifier}` : `${layer.name} allows no external imports; found ${specifier}` });
    }
  }
  return issues;
}

const rawElementDirectory = "apps/web/src";
const rawElementFreeDirectory = "apps/web/src/ui";
const forbiddenRawElements = new Set(["button", "input", "select", "textarea"]);

function jsxTagName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  return node.tagName.getText();
}

function rawElementIssues(file: string, source: ts.SourceFile): Issue[] {
  if (!file.startsWith(`${rawElementDirectory}/`) || file.startsWith(`${rawElementFreeDirectory}/`)) return [];
  const issues: Issue[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = jsxTagName(node);
      if (forbiddenRawElements.has(tagName)) {
        issues.push({
          file,
          line: lineOf(source.getFullText(), node.getStart(source)),
          rule: "reuse-ui-primitives",
          message: `<${tagName}> is forbidden outside ${rawElementFreeDirectory}; use the matching component from @/ui`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return issues;
}

const controlBytePattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function controlByteIssues(file: string, text: string): Issue[] {
  const issues: Issue[] = [];
  let match: RegExpExecArray | null;
  controlBytePattern.lastIndex = 0;
  while ((match = controlBytePattern.exec(text)) !== null) {
    const code = match[0].charCodeAt(0).toString(16).padStart(4, "0").toUpperCase();
    issues.push({
      file,
      line: lineOf(text, match.index),
      rule: "no-control-bytes",
      message: `A raw control byte U+${code} makes this file read as binary to grep, git and every rename; write it as an escape instead`,
    });
  }
  return issues;
}

function plainTextCommentIssues(file: string, text: string, pattern: RegExp, message: string): Issue[] {
  const issues: Issue[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    issues.push({ file, line: lineOf(text, match.index), rule: "no-comments", message });
  }
  return issues;
}

export function checkSource(file: string, text: string): Issue[] {
  return [...controlByteIssues(file, text), ...syntaxIssues(file, text)];
}

export function hasCheckedSyntax(file: string): boolean {
  const ext = extensionOf(file);
  const base = file.slice(file.lastIndexOf("/") + 1);
  return (
    scriptExtensions.includes(ext) ||
    markupExtensions.includes(ext) ||
    hashCommentExtensions.includes(ext) ||
    hashCommentNames.includes(base)
  );
}

export function checkBytes(file: string, bytes: Uint8Array): Issue[] {
  const text = decodedText(bytes);
  if (text !== undefined) return checkSource(file, text);
  if (!hasCheckedSyntax(file)) return [];
  return [
    {
      file,
      line: 1,
      rule: "invalid-utf8",
      message:
        "This file is not valid UTF-8, so every other rule would have to skip it; a file with a checked extension has to be readable text",
    },
  ];
}

function syntaxIssues(file: string, text: string): Issue[] {
  const ext = extensionOf(file);
  const base = file.slice(file.lastIndexOf("/") + 1);
  if (scriptExtensions.includes(ext)) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(ext));
    const issues = [
      ...commentIssuesInScript(file, source),
      ...anyIssues(file, source),
      ...envIssues(file, source),
      ...rawElementIssues(file, source),
    ];
    const layer = layerOf(file);
    if (layer) issues.push(...importIssues(file, layer, source));
    return issues;
  }
  if (ext === ".css") return plainTextCommentIssues(file, text, /\/\*/g, "CSS comments are forbidden");
  if (ext === ".md" || ext === ".mdx" || ext === ".html" || ext === ".svg") {
    return plainTextCommentIssues(file, text, /<!--/g, "HTML comments are forbidden");
  }
  if (ext === ".json" || ext === ".jsonc") return plainTextCommentIssues(file, text, /^\s*\/\//gm, "JSON comments are forbidden");
  if (hashCommentExtensions.includes(ext) || hashCommentNames.includes(base)) {
    const issues: Issue[] = [];
    text.split("\n").forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") && !(index === 0 && trimmed.startsWith("#!"))) {
        issues.push({ file, line: index + 1, rule: "no-comments", message: "Hash comments are forbidden" });
      }
    });
    return issues;
  }
  return [];
}

export function formatIssues(issues: Issue[]): string {
  return issues.map((issue) => `${issue.file}:${issue.line} [${issue.rule}] ${issue.message}`).join("\n");
}
