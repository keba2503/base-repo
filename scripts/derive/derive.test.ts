import { afterAll, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  baseOnlyFiles,
  declaredScope,
  defectsLeftWithoutEvidence,
  derive,
  derivedSteps,
  isInsideTree,
  layerGraph,
  normalisedScope,
  replaceSection,
  structureDocument,
  trackedFiles,
  validatedRepositoryName,
} from "./derive";
import { compareStructure, documentedDirectories, trackedDirectories } from "../architecture/check-structure";

const temporaryRoots: string[] = [];

function copyOfTheTree(): { root: string; files: readonly string[] } {
  const source = process.cwd();
  const files = trackedFiles(source);
  const root = mkdtempSync(join(tmpdir(), "derive-"));
  temporaryRoots.push(root);
  for (const file of files) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, file), target);
  }
  return { root, files };
}

function textOf(root: string, file: string): string {
  return readFileSync(join(root, file), "utf8");
}

function stillMentioning(root: string, files: readonly string[], scope: string): string[] {
  return files.filter((file) => {
    if (!existsSync(join(root, file))) return false;
    try {
      return readFileSync(join(root, file), "utf8").includes(scope);
    } catch {
      return false;
    }
  });
}

afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

describe("normalisedScope", () => {
  test("accepts a bare scope and an at-prefixed one alike", () => {
    expect(normalisedScope("acme")).toBe("@acme");
    expect(normalisedScope("@acme")).toBe("@acme");
  });

  test("refuses what npm would refuse", () => {
    expect(() => normalisedScope("")).toThrow();
    expect(() => normalisedScope("@")).toThrow();
    expect(() => normalisedScope("Acme")).toThrow();
    expect(() => normalisedScope("acme/web")).toThrow();
    expect(() => normalisedScope("-acme")).toThrow();
    expect(() => normalisedScope(".acme")).toThrow();
    expect(() => normalisedScope("acme corp")).toThrow();
  });
});

describe("validatedRepositoryName", () => {
  test("accepts a package name and refuses a scope", () => {
    expect(validatedRepositoryName("park-pizza-planet")).toBe("park-pizza-planet");
    expect(() => validatedRepositoryName("@acme/web")).toThrow();
    expect(() => validatedRepositoryName("Park Pizza")).toThrow();
  });
});

describe("replaceSection", () => {
  test("replaces the body between a heading and the next one of the same level", () => {
    const document = "# T\n\n## A\n\nold\n\n## B\n\nkeep\n";
    expect(replaceSection(document, "## A", "new")).toBe("# T\n\n## A\n\nnew\n\n## B\n\nkeep\n");
  });

  test("leaves a deeper heading inside the section alone", () => {
    const document = "## A\n\nold\n\n### inner\n\nalso old\n\n## B\n";
    expect(replaceSection(document, "## A", "new")).toBe("## A\n\nnew\n\n## B\n");
  });

  test("reports a heading it cannot find", () => {
    expect(replaceSection("## A\n", "## Missing", "new")).toBeUndefined();
  });
});

describe("derive", () => {
  test("renames the scope in every tracked text file, not only the documented handful", () => {
    const { root, files } = copyOfTheTree();
    const previous = declaredScope(root);

    const report = derive({ root, scope: "acme", repositoryName: "park-pizza-planet", files });

    expect(report.previousScope).toBe(previous);
    expect(report.scope).toBe("@acme");
    expect(report.renamed.length).toBeGreaterThan(200);
    expect(stillMentioning(root, files, previous)).toEqual([]);
    expect(declaredScope(root)).toBe("@acme");
    expect(textOf(root, "packages/domain/package.json")).toContain('"@acme/domain"');
    expect(textOf(root, ".github/workflows/ci.yml")).toContain("@acme/infrastructure");
  });

  test("renames the root package and takes every base-only file with it, itself included", () => {
    const { root, files } = copyOfTheTree();

    const report = derive({ root, scope: "@acme", repositoryName: "park-pizza-planet", files });

    const manifest = JSON.parse(textOf(root, "package.json"));
    expect(manifest.name).toBe("park-pizza-planet");
    expect(manifest.scripts.derive).toBeUndefined();
    expect(manifest.scripts.check).toBeDefined();
    for (const file of baseOnlyFiles) expect(report.deleted).toContain(file);
    for (const file of baseOnlyFiles) expect(existsSync(join(root, file))).toBe(false);
    for (const file of report.deleted) expect(existsSync(join(root, file))).toBe(false);
    expect(report.deleted.filter((file) => file.startsWith("docs/defects/")).length).toBeGreaterThan(0);
  });

  test("leaves a derived tree that no longer carries this tool or its test", () => {
    const { root, files } = copyOfTheTree();

    derive({ root, scope: "acme", repositoryName: "park-pizza-planet", files });

    expect(existsSync(join(root, "scripts/derive/derive.ts"))).toBe(false);
    expect(existsSync(join(root, "scripts/derive/derive.test.ts"))).toBe(false);
    expect(existsSync(join(root, "scripts/derive/run.ts"))).toBe(false);
    expect(textOf(root, "package.json")).not.toContain("scripts/derive/run.ts");
  });

  test("rewrites the prose that is only true of the base repository", () => {
    const { root, files } = copyOfTheTree();

    derive({ root, scope: "acme", repositoryName: "park-pizza-planet", files });

    const readme = textOf(root, "README.md");
    expect(readme.split("\n")[0]).toBe("# park-pizza-planet");
    expect(readme).not.toContain("This is a **base repository**");
    expect(readme).not.toContain("bun run derive");
    expect(readme).toContain("bun run check");
    expect(textOf(root, "SECURITY.md")).not.toContain("This is a base repository");
    expect(textOf(root, "AGENTS.md")).not.toContain("This repository is a base.");
    expect(textOf(root, "docs/layers/web.md")).not.toContain("This repository is a base:");
  });

  test("refuses a second run instead of renaming a scope that is already the requested one", () => {
    const { root, files } = copyOfTheTree();

    derive({ root, scope: "acme", repositoryName: "park-pizza-planet", files });

    expect(() => derive({ root, scope: "acme", repositoryName: "park-pizza-planet", files })).toThrow(
      /derived already/,
    );
  });

  test("refuses before touching anything when the scope is not a valid npm scope", () => {
    const { root, files } = copyOfTheTree();
    const before = textOf(root, layerGraph);

    expect(() => derive({ root, scope: "Park Pizza", repositoryName: "park-pizza-planet", files })).toThrow(
      /not an npm scope/,
    );
    expect(textOf(root, layerGraph)).toBe(before);
  });

  test("leaves a binary file untouched and reports it", () => {
    const { root, files } = copyOfTheTree();
    const icon = "apps/web/src/app/favicon.ico";
    const before = readFileSync(join(root, icon));

    const report = derive({ root, scope: "acme", repositoryName: "park-pizza-planet", files });

    expect(report.binary).toContain(icon);
    expect(readFileSync(join(root, icon)).equals(before)).toBe(true);
  });

  test("keeps every step of the derivation in the README it writes and in what it prints", () => {
    const { root, files } = copyOfTheTree();

    derive({ root, scope: "acme", repositoryName: "park-pizza-planet", files });

    const readme = textOf(root, "README.md");
    for (const step of derivedSteps) expect(readme).toContain(step);
    expect(readme).toContain(".github/CODEOWNERS");
    expect(readme).toContain("SECURITY.md");
    expect(readme).toContain("chore: derive from base-repo");
  });

  test("leaves a tree ESTRUCTURA.md still describes exactly, with no line for the deleted tool", () => {
    const { root, files } = copyOfTheTree();

    const report = derive({ root, scope: "acme", repositoryName: "park-pizza-planet", files });

    const remaining = files.filter((file) => !report.deleted.includes(file));
    const failures = compareStructure(
      trackedDirectories(remaining),
      documentedDirectories(textOf(root, structureDocument)),
    );
    expect(failures).toEqual([]);
    expect(textOf(root, structureDocument)).not.toContain("scripts/derive ");
  });

  test("refuses a file list that points outside the tree", () => {
    const { root, files } = copyOfTheTree();

    expect(() =>
      derive({ root, scope: "acme", repositoryName: "x", files: [...files, "../outside.ts"] }),
    ).toThrow(/outside the tree/);
    expect(() =>
      derive({ root, scope: "acme", repositoryName: "x", files: [...files, "/etc/passwd"] }),
    ).toThrow(/outside the tree/);
    expect(declaredScope(root)).toBe("@base");
  });
});

describe("isInsideTree", () => {
  test("accepts a plain relative path and refuses an escape", () => {
    expect(isInsideTree("packages/domain/src/a.ts")).toBe(true);
    expect(isInsideTree("..")).toBe(false);
    expect(isInsideTree("../outside.ts")).toBe(false);
    expect(isInsideTree("a/../../b.ts")).toBe(false);
    expect(isInsideTree("/etc/passwd")).toBe(false);
    expect(isInsideTree("C:/windows")).toBe(false);
    expect(isInsideTree("")).toBe(false);
  });
});

describe("defectsLeftWithoutEvidence", () => {
  test("names a defect record whose gate, test or regression test is being removed", () => {
    const texts = new Map([
      ["docs/defects/DEF-0001-a.md", "---\nid: DEF-0001\nprevented_by: test\ntest: scripts/derive/derive.test.ts\n---\n"],
      ["docs/defects/DEF-0002-b.md", "---\nid: DEF-0002\nprevented_by: gate\ngate: scripts/architecture/check-source.ts\nregression_test: scripts/derive/derive.test.ts\n---\n"],
      ["docs/defects/DEF-0003-c.md", "---\nid: DEF-0003\nprevented_by: test\ntest: packages/domain/src/a.test.ts\n---\n"],
      ["docs/defects/README.md", "test: scripts/derive/derive.test.ts\n"],
    ]);

    expect(defectsLeftWithoutEvidence(texts, new Set(["scripts/derive/derive.test.ts"]))).toEqual([
      "docs/defects/DEF-0001-a.md",
      "docs/defects/DEF-0002-b.md",
    ]);
  });

  test("names nothing when no evidence is being removed", () => {
    const texts = new Map([["docs/defects/DEF-0003-c.md", "test: packages/domain/src/a.test.ts\n"]]);
    expect(defectsLeftWithoutEvidence(texts, new Set(["docs/base.html"]))).toEqual([]);
  });
});
