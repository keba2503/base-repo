import { describe, expect, it } from "bun:test";
import {
  compareStructure,
  documentedDirectories,
  structureHeading,
  trackedDirectories,
} from "./check-structure";

function documentWith(lines: readonly string[]): string {
  return ["# Title", "", structureHeading, "", "```", ...lines, "```", "", "Tail"].join("\n");
}

describe("documentedDirectories", () => {
  it("reads the path of every line of the tree block", () => {
    const document = documentWith(["apps/web    La aplicación", "packages/domain    Las reglas"]);

    expect(documentedDirectories(document)).toEqual(["apps/web", "packages/domain"]);
  });

  it("finds nothing when the heading is missing", () => {
    expect(documentedDirectories("# Title\n\n```\napps/web\n```")).toEqual([]);
  });
});

describe("trackedDirectories", () => {
  it("derives every ancestor directory of a tracked file", () => {
    expect(trackedDirectories(["apps/web/src/main/env.ts"])).toEqual([
      "apps",
      "apps/web",
      "apps/web/src",
      "apps/web/src/main",
    ]);
  });

  it("ignores files at the root", () => {
    expect(trackedDirectories(["README.md"])).toEqual([]);
  });
});

describe("compareStructure", () => {
  it("reports a directory that exists and is not described", () => {
    expect(compareStructure(["apps", "apps/web"], ["apps"])).toEqual([
      { path: "apps/web", reason: "undocumented" },
    ]);
  });

  it("reports a described directory that no longer exists", () => {
    expect(compareStructure(["apps"], ["apps", "apps/legacy"])).toEqual([
      { path: "apps/legacy", reason: "stale" },
    ]);
  });

  it("passes when both sides match", () => {
    expect(compareStructure(["apps", "apps/web"], ["apps/web", "apps"])).toEqual([]);
  });
});
