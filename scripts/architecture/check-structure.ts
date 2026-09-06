import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const structureDocument = "ESTRUCTURA.md";
export const structureHeading = "## El árbol completo";

export type StructureFailure = {
  readonly path: string;
  readonly reason: "undocumented" | "stale";
};

function fencedBlockAfterHeading(document: string, heading: string): string | undefined {
  const lines = document.split("\n");
  const headingIndex = lines.indexOf(heading);
  if (headingIndex === -1) return undefined;

  const openingIndex = lines.indexOf("```", headingIndex);
  if (openingIndex === -1) return undefined;

  const closingIndex = lines.indexOf("```", openingIndex + 1);
  if (closingIndex === -1) return undefined;

  return lines.slice(openingIndex + 1, closingIndex).join("\n");
}

export function documentedDirectories(document: string): readonly string[] {
  const block = fencedBlockAfterHeading(document, structureHeading);
  if (block === undefined) return [];

  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/)[0] ?? "");
}

export function trackedDirectories(trackedFiles: readonly string[]): readonly string[] {
  const directories = new Set<string>();

  for (const file of trackedFiles) {
    let directory = dirname(file);
    while (directory !== "." && directory !== "/" && directory.length > 0) {
      directories.add(directory);
      directory = dirname(directory);
    }
  }

  return [...directories].sort();
}

export function compareStructure(
  tracked: readonly string[],
  documented: readonly string[],
): readonly StructureFailure[] {
  const documentedSet = new Set(documented);
  const trackedSet = new Set(tracked);

  const undocumented = tracked
    .filter((path) => !documentedSet.has(path))
    .map((path): StructureFailure => ({ path, reason: "undocumented" }));

  const stale = documented
    .filter((path) => !trackedSet.has(path))
    .map((path): StructureFailure => ({ path, reason: "stale" }));

  return [...undocumented, ...stale];
}

export function checkStructure(projectDirectory: string, trackedFiles: readonly string[]): readonly StructureFailure[] {
  const document = readFileSync(join(projectDirectory, structureDocument), "utf8");
  return compareStructure(trackedDirectories(trackedFiles), documentedDirectories(document));
}

export const plannedHeading = "## Lo que aún no existe";

export function plannedDirectories(document: string): readonly string[] {
  const block = fencedBlockAfterHeading(document, plannedHeading);
  if (block === undefined) return [];

  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/)[0] ?? "");
}

export function arrivedPlans(
  tracked: readonly string[],
  planned: readonly string[],
): readonly string[] {
  const trackedSet = new Set(tracked);
  return planned.filter((path) => trackedSet.has(path));
}

export function checkPlanned(projectDirectory: string, trackedFiles: readonly string[]): readonly string[] {
  const document = readFileSync(join(projectDirectory, structureDocument), "utf8");
  return arrivedPlans(trackedDirectories(trackedFiles), plannedDirectories(document));
}
