import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { checkDefectRegistry, defectsDirectory, type DefectFile } from "./check-defects";

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

const failures = checkDefectRegistry(defectFiles(), trackedFiles());

if (failures.length > 0) {
  console.error(`Registro de defectos inconsistente en ${defectsDirectory}:`);
  for (const failure of failures) console.error(`  ${failure.path}: ${failure.reason}`);
  process.exit(1);
}

console.log(`${defectsDirectory} declara cómo se impide que vuelva cada defecto, y cada afirmación se comprueba contra el repositorio`);
