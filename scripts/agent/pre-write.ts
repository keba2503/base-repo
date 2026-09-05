import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { checkSource, formatIssues } from "../architecture/check-source";
import { block, projectDir, readPayload, type EditInput, type WriteInput } from "./hook-input";

const ignoredSegments = ["/node_modules/", "/.next/", "/.git/"];

function nextContent(input: WriteInput | EditInput, absolutePath: string): string {
  if ("content" in input) return input.content;
  let current = "";
  try {
    current = readFileSync(absolutePath, "utf8");
  } catch {
    current = "";
  }
  if (input.replace_all) return current.split(input.old_string).join(input.new_string);
  return current.replace(input.old_string, () => input.new_string);
}

const payload = await readPayload();
const input = payload.tool_input as WriteInput | EditInput | undefined;
if (!input || !("file_path" in input)) process.exit(0);

const root = projectDir();
const absolutePath = resolve(root, input.file_path);
const relativePath = relative(root, absolutePath);
if (relativePath.startsWith("..") || ignoredSegments.some((segment) => `/${relativePath}`.includes(segment))) process.exit(0);

const issues = checkSource(relativePath, nextContent(input, absolutePath));
if (issues.length > 0) {
  block(`Write rejected by the architecture check. Fix the content, do not weaken the rule.\n${formatIssues(issues)}\nRules: docs/standards/code-style.md and docs/architecture/dependency-rule.md`);
}
