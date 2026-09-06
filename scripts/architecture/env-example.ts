import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  compareEnvExample,
  documentedEnvVariables,
  envExampleDocument,
  envFilePattern,
  requiredVariablesFrom,
  type RequiredEnvVariable,
} from "./check-env-example";

function trackedFiles(): string[] {
  return execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0);
}

const envFiles = trackedFiles().filter((file) => envFilePattern.test(file));
const required: RequiredEnvVariable[] = [];
for (const file of envFiles) {
  required.push(...requiredVariablesFrom(file, readFileSync(file, "utf8")));
}

const document = readFileSync(envExampleDocument, "utf8");
const failures = compareEnvExample(required, documentedEnvVariables(document));

if (failures.length > 0) {
  console.error(`Missing from ${envExampleDocument}, required in production and not documented there:`);
  for (const failure of failures) console.error(`  ${failure.variable} (required by ${failure.file})`);
  process.exit(1);
}

console.log(`${envExampleDocument} documents every variable required in production`);
