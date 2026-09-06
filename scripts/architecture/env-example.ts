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
import { ungovernedOptionalVariables, type UngovernedEnvVariable } from "./check-env-completeness";

function trackedFiles(): string[] {
  return execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0);
}

const envFiles = trackedFiles().filter((file) => envFilePattern.test(file));
const declared: DeclaredEnvVariable[] = [];
const ungoverned: UngovernedEnvVariable[] = [];
for (const file of envFiles) {
  const text = readFileSync(file, "utf8");
  declared.push(...declaredVariablesFrom(file, text));
  ungoverned.push(...ungovernedOptionalVariables(file, text));
}

if (ungoverned.length > 0) {
  console.error(
    "Optional in the schema, but neither required by any rule nor declared in intentionallyOptionalEnvVariables:",
  );
  for (const variable of ungoverned) console.error(`  ${variable.variable} (${variable.file})`);
  process.exit(1);
}

const document = readFileSync(envExampleDocument, "utf8");
const failures = compareEnvExample(declared, documentedEnvVariables(document));

if (failures.length > 0) {
  console.error(`Missing from ${envExampleDocument}, declared by a module and not documented there:`);
  for (const failure of failures) console.error(`  ${failure.variable} (declared by ${failure.file})`);
  process.exit(1);
}

console.log(`${envExampleDocument} documents every variable declared by a module, and no optional variable is ungoverned`);
