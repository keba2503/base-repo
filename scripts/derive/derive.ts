import { execSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodedText } from "../utf8";

export type DeriveRequest = {
  readonly root: string;
  readonly scope: string;
  readonly repositoryName: string;
  readonly files: readonly string[];
};

export type DeriveReport = {
  readonly previousScope: string;
  readonly scope: string;
  readonly repositoryName: string;
  readonly renamed: readonly string[];
  readonly rewritten: readonly string[];
  readonly deleted: readonly string[];
  readonly binary: readonly string[];
};

export const layerGraph = "architecture/layers.json";
export const toolDirectory = "scripts/derive";
export const structureDocument = "ESTRUCTURA.md";
export const baseOnlyFiles = [
  "docs/base.html",
  "docs/architecture-map.html",
  "docs/architecture-map.json",
  `${toolDirectory}/derive.ts`,
  `${toolDirectory}/derive.test.ts`,
  `${toolDirectory}/run.ts`,
] as const;

const nameGrammar = /^[a-z0-9][a-z0-9._-]*$/;
const nameLimit = 214;

export function normalisedScope(scope: string): string {
  const bare = scope.startsWith("@") ? scope.slice(1) : scope;
  if (bare.length === 0 || bare.length > nameLimit || !nameGrammar.test(bare)) {
    throw new Error(
      `"${scope}" is not an npm scope: use lowercase letters, digits, and any of . _ - starting with a letter or a digit, at most ${nameLimit} characters`,
    );
  }
  return `@${bare}`;
}

export function validatedRepositoryName(name: string): string {
  if (name.length === 0 || name.length > nameLimit || !nameGrammar.test(name)) {
    throw new Error(
      `"${name}" is not a package name: use lowercase letters, digits, and any of . _ - starting with a letter or a digit, at most ${nameLimit} characters`,
    );
  }
  return name;
}

export function isInsideTree(file: string): boolean {
  if (file.length === 0 || file.startsWith("/") || /^[A-Za-z]:/.test(file)) return false;
  return !file.split(/[/\\]/).includes("..");
}

export function declaredScope(root: string): string {
  const graph: unknown = JSON.parse(readFileSync(join(root, layerGraph), "utf8"));
  const declared = (graph as { scope?: unknown }).scope;
  if (typeof declared !== "string" || declared.length === 0) {
    throw new Error(`${layerGraph} declares no scope; there is nothing to rename`);
  }
  return declared;
}

function scopePattern(scope: string): RegExp {
  const escaped = scope.slice(1).replaceAll(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return new RegExp(`@${escaped}(?![A-Za-z0-9._-])`, "g");
}

export function replaceSection(document: string, heading: string, body: string): string | undefined {
  const lines = document.split("\n");
  const start = lines.indexOf(heading);
  if (start === -1) return undefined;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if ((lines[index] ?? "").startsWith("## ")) {
      end = index;
      break;
    }
  }
  return [...lines.slice(0, start + 1), "", ...body.split("\n"), "", ...lines.slice(end)].join("\n");
}

function purposeOf(repositoryName: string): string {
  return `${repositoryName} derives from a Clean Architecture base repository and keeps its gates. The dependency rule is absolute: source code dependencies only ever point inward, toward higher-level policy. The graph of who may import whom lives in a single file, \`architecture/layers.json\`, and every other tool (the architecture checker, dependency-cruiser, ESLint) reads from it instead of encoding the rule twice.`;
}

export const derivedSteps: readonly string[] = [
  "Update `.github/CODEOWNERS` and `SECURITY.md` with this project's owners and contact; no tool can guess them.",
  "Run `bun install`, then `bun run check`; it has to be green before anything else.",
  "Commit the derivation as `chore: derive from base-repo`. Nothing but names changed, so it needs no ring review.",
  "If this repository is private, code scanning needs GitHub Code Security enabled for the account. Without it, disable `.github/workflows/codeql.yml` under **Actions** rather than making it report green without scanning (`docs/decisions/0032`).",
  "Start building inside `packages/domain` outward; see the layer table below.",
];

const derivedGettingStarted = derivedSteps
  .map((step, index) => `${index + 1}. ${step}`)
  .join("\n");

const derivedSupportedVersions = [
  "Security fixes land on the `main` branch of this repository.",
  "",
  "This project was derived from a base repository rather than forked from it: fixes made there do not arrive on their own, and pulling one in is a deliberate change on this project's own schedule.",
].join("\n");

const baseSentences: readonly { readonly path: string; readonly from: string; readonly to: string }[] = [
  {
    path: "AGENTS.md",
    from: "This repository is a base. Projects derive from it.",
    to: "This repository derives from a base repository and keeps its rules.",
  },
  {
    path: "docs/layers/web.md",
    from: "This repository is a base: projects derive from it and each one builds its own look.",
    to: "This repository derives from a base repository and builds its own look.",
  },
];

type Rewrite = {
  readonly path: string;
  readonly apply: (document: string, repositoryName: string) => string | undefined;
};

const rewrites: readonly Rewrite[] = [
  {
    path: "README.md",
    apply: (document, repositoryName) => {
      const lines = document.split("\n");
      if (!(lines[0] ?? "").startsWith("# ")) return undefined;
      const retitled = [`# ${repositoryName}`, ...lines.slice(1)]
        .filter((line) => !line.startsWith("| `bun run derive`"))
        .join("\n");
      const withPurpose = replaceSection(retitled, "## Purpose", purposeOf(repositoryName));
      if (withPurpose === undefined) return undefined;
      return replaceSection(withPurpose, "## Getting started", derivedGettingStarted);
    },
  },
  {
    path: "SECURITY.md",
    apply: (document) => replaceSection(document, "## Supported versions", derivedSupportedVersions),
  },
  {
    path: structureDocument,
    apply: (document) => {
      const kept = document.split("\n").filter((line) => !line.startsWith(`${toolDirectory} `));
      return kept.length === document.split("\n").length ? undefined : kept.join("\n");
    },
  },
  ...baseSentences.map(
    (sentence): Rewrite => ({
      path: sentence.path,
      apply: (document) =>
        document.includes(sentence.from) ? document.replace(sentence.from, sentence.to) : undefined,
    }),
  ),
];

function renamedRootPackage(document: string, repositoryName: string): string | undefined {
  const manifest: unknown = JSON.parse(document);
  if (typeof (manifest as { name?: unknown }).name !== "string") return undefined;
  const lines = document.split("\n").filter((line) => !/^\s*"derive":\s*"bun scripts\/derive\/run\.ts",?\s*$/.test(line));
  const index = lines.findIndex((line) => /^ {2}"name":\s*"[^"]*",?\s*$/.test(line));
  if (index === -1) return undefined;
  lines[index] = (lines[index] ?? "").replace(/"name":\s*"[^"]*"/, `"name": "${repositoryName}"`);
  return lines.join("\n");
}

export const defectsDirectory = "docs/defects/";

const evidenceKeys = ["gate", "test", "regression_test"] as const;

export function namesRemovedEvidence(content: string, removed: ReadonlySet<string>): boolean {
  for (const line of content.split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (!(evidenceKeys as readonly string[]).includes(key)) continue;
    if (removed.has(line.slice(separator + 1).trim())) return true;
  }
  return false;
}

export function defectsLeftWithoutEvidence(
  texts: ReadonlyMap<string, string>,
  removed: ReadonlySet<string>,
): string[] {
  return [...texts]
    .filter(([path]) => path.startsWith(defectsDirectory) && path.endsWith(".md"))
    .filter(([path]) => !path.endsWith("/README.md"))
    .filter(([, content]) => namesRemovedEvidence(content, removed))
    .map(([path]) => path)
    .sort();
}

export function derive(request: DeriveRequest): DeriveReport {
  const scope = normalisedScope(request.scope);
  const repositoryName = validatedRepositoryName(request.repositoryName);
  const previousScope = normalisedScope(declaredScope(request.root));

  if (previousScope === scope) {
    throw new Error(
      `${layerGraph} already declares the scope ${scope}: this tree has been derived already, and there is nothing left to rename`,
    );
  }

  const escaping = request.files.filter((file) => !isInsideTree(file));
  if (escaping.length > 0) {
    throw new Error(
      `these paths point outside the tree and will not be rewritten: ${escaping.join(", ")}`,
    );
  }

  const pattern = scopePattern(previousScope);
  const texts = new Map<string, string>();
  const binary: string[] = [];

  for (const file of request.files) {
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(join(request.root, file));
    } catch {
      continue;
    }
    const text = decodedText(bytes);
    if (text === undefined) {
      binary.push(file);
      continue;
    }
    texts.set(file, text);
  }

  const carrying = [...texts].filter(([, text]) => text.match(pattern) !== null);
  if (carrying.length === 0) {
    throw new Error(
      `no file mentions the scope ${previousScope}: this tree has been derived already, or it is not a copy of the base repository`,
    );
  }

  const rewritten = new Map<string, string>();
  for (const rewrite of rewrites) {
    const document = texts.get(rewrite.path);
    if (document === undefined) {
      throw new Error(`${rewrite.path} is missing: this does not look like a copy of the base repository`);
    }
    const next = rewrite.apply(document, repositoryName);
    if (next === undefined) {
      throw new Error(
        `${rewrite.path} no longer has the section this derivation rewrites: rewrite it by hand and check what else has drifted`,
      );
    }
    rewritten.set(rewrite.path, next);
  }

  const manifest = texts.get("package.json");
  if (manifest === undefined) throw new Error("package.json is missing");
  const renamedManifest = renamedRootPackage(manifest, repositoryName);
  if (renamedManifest === undefined) throw new Error("package.json declares no name to rename");
  rewritten.set("package.json", renamedManifest);

  for (const [path, document] of rewritten) texts.set(path, document);

  const deleted: string[] = [];
  const removing = new Set<string>(baseOnlyFiles);
  for (const file of [...baseOnlyFiles, ...defectsLeftWithoutEvidence(texts, removing)]) {
    if (!texts.has(file)) continue;
    rmSync(join(request.root, file));
    texts.delete(file);
    deleted.push(file);
  }

  const renamed: string[] = [];
  for (const [path, document] of texts) {
    const next = document.replaceAll(pattern, scope);
    if (next !== document) renamed.push(path);
    if (next !== document || rewritten.has(path)) writeFileSync(join(request.root, path), next);
  }

  return {
    previousScope,
    scope,
    repositoryName,
    renamed: renamed.sort(),
    rewritten: [...rewritten.keys()].sort(),
    deleted,
    binary,
  };
}

export function trackedFiles(root: string): string[] {
  return execSync("git ls-files --cached --others --exclude-standard", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0);
}

export function reportOf(report: DeriveReport): string {
  return [
    `renamed ${report.previousScope} to ${report.scope} in ${report.renamed.length} files`,
    `renamed the root package to ${report.repositoryName}`,
    `rewrote the base-only prose in ${report.rewritten.join(", ")}`,
    report.deleted.length > 0 ? `deleted ${report.deleted.join(", ")}` : "deleted nothing",
    `left ${report.binary.length} binary files untouched`,
    "",
    "Next, the same steps this project's README now opens with:",
    ...derivedSteps.map((step, index) => `  ${index + 1}. ${step}`),
  ].join("\n");
}

export const partialRunAdvice =
  "Nothing was renamed, or the rename stopped part way. This tool is meant to run on a fresh clone with no work of your own in it: check git status, and undo a partial run with git checkout -- .";
