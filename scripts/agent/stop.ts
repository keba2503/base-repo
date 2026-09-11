import { execSync, spawnSync } from "node:child_process";
import { block, projectDir, readPayload } from "./hook-input";

const payload = await readPayload();
if (payload.stop_hook_active) process.exit(0);

const root = projectDir();
const dirty = execSync("git status --porcelain", { cwd: root, encoding: "utf8" }).trim();
if (dirty.length === 0) process.exit(0);

const result = spawnSync("bun", ["run", "check:fast"], { cwd: root, encoding: "utf8" });
if (result.status === 0) process.exit(0);

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
block(`You cannot finish with quality gates failing. Fix the causes below, then try again. Do not disable or weaken any gate. The full \`bun run check\` runs at pre-push and CI.\n${output}`);
