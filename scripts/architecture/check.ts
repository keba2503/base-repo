import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { checkSource, formatIssues, type Issue } from "./check-source";

const ignored = ["bun.lock", "next-env.d.ts"];

function trackedFiles(): string[] {
  return execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0)
    .filter((file) => !ignored.some((name) => file.endsWith(name)));
}

const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : trackedFiles();
const issues: Issue[] = [];
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  issues.push(...checkSource(file, text));
}
if (issues.length > 0) {
  console.error(formatIssues(issues));
  process.exit(1);
}
console.log(`architecture check passed for ${files.length} files`);
