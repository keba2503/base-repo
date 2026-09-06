import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { checkDefectRegistry, defectsDirectory, directlyInvoked, type DefectFile } from "./check-defects";

function trackedFiles(): string[] {
  return execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0);
}

function defectFiles(): DefectFile[] {
  return readdirSync(defectsDirectory)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => `${defectsDirectory}/${name}`)
    .map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

function entryPoints(files: readonly string[]): DefectFile[] {
  return files
    .filter(
      (file) =>
        file === "package.json" ||
        file === ".claude/settings.json" ||
        file.startsWith(".github/workflows/"),
    )
    .map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

function reachableGates(files: readonly string[]): string[] {
  const tracked = new Set(files);
  const pending = directlyInvoked(entryPoints(files));
  const reached = new Set<string>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || reached.has(current) || !tracked.has(current)) continue;
    reached.add(current);
    if (!current.endsWith(".ts")) continue;
    const directory = current.slice(0, current.lastIndexOf("/"));
    for (const match of readFileSync(current, "utf8").matchAll(/from "(\.[^"]+)"/g)) {
      pending.push(`${resolve(directory, match[1])}.ts`.slice(process.cwd().length + 1));
    }
  }

  return [...reached];
}

const tracked = trackedFiles();
const failures = checkDefectRegistry(defectFiles(), tracked, reachableGates(tracked));

if (failures.length > 0) {
  console.error(`Registro de defectos inconsistente en ${defectsDirectory}:`);
  for (const failure of failures) console.error(`  ${failure.path}: ${failure.reason}`);
  process.exit(1);
}

console.log(`${defectsDirectory} declara cómo se impide que vuelva cada defecto, y cada afirmación se comprueba contra el repositorio`);
