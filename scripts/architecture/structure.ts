import { execSync } from "node:child_process";
import { checkStructure, structureDocument } from "./check-structure";

function trackedFiles(): string[] {
  return execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0);
}

const failures = checkStructure(process.cwd(), trackedFiles());

if (failures.length > 0) {
  const undocumented = failures.filter((failure) => failure.reason === "undocumented");
  const stale = failures.filter((failure) => failure.reason === "stale");

  if (undocumented.length > 0) {
    console.error(`Missing from ${structureDocument}, describe each one in the same change:`);
    for (const failure of undocumented) console.error(`  ${failure.path}`);
  }
  if (stale.length > 0) {
    console.error(`Listed in ${structureDocument} but no longer present, remove each line:`);
    for (const failure of stale) console.error(`  ${failure.path}`);
  }
  process.exit(1);
}

console.log(`${structureDocument} describes every tracked directory`);
