import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  compareEnvExample,
  declaredVariablesFrom,
  documentedEnvVariables,
  envExampleDocument,
  envFilePattern,
  type DeclaredEnvVariable,
} from "./check-env-example";

function trackedFiles(): string[] {
  return execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0);
}

const envFiles = trackedFiles().filter((file) => envFilePattern.test(file));
const declared: DeclaredEnvVariable[] = [];
for (const file of envFiles) {
  declared.push(...declaredVariablesFrom(file, readFileSync(file, "utf8")));
}

const document = readFileSync(envExampleDocument, "utf8");
const failures = compareEnvExample(declared, documentedEnvVariables(document));

if (failures.length > 0) {
  console.error(`Missing from ${envExampleDocument}, declared by a module and not documented there:`);
  for (const failure of failures) console.error(`  ${failure.variable} (declared by ${failure.file})`);
  process.exit(1);
}

console.log(`${envExampleDocument} documents every variable declared by a module`);
