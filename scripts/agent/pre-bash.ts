import { block, readPayload, type BashInput } from "./hook-input";

const deniedPatterns: { pattern: RegExp; reason: string }[] = [
  { pattern: /(^|[\s;&|])(npm|pnpm|yarn|npx)(\s|$)/, reason: "Only bun is allowed in this repository" },
  { pattern: /(^|[\s;&|])bunx\s+(?!playwright(\s|$))/, reason: "bunx runs a package that is not in bun.lock; add it as a devDependency and call it through bun run" },
  { pattern: /(^|[\s;&|])bunx\s+playwright[^\n]*@/, reason: "Run the pinned playwright, never a version fetched on the fly" },
  { pattern: /git\s+push[^\n]*(--force|-f\b|--force-with-lease)/, reason: "Force push is forbidden" },
  { pattern: /git\s+push/, reason: "Push only when the user explicitly asked for it in their own words; if they did, run the push through a command that states it, for example prefix it with ALLOW_PUSH=1" },
  { pattern: /--no-verify/, reason: "Bypassing hooks is forbidden" },
  { pattern: /git\s+reset\s+--hard/, reason: "Hard reset discards work; ask the user" },
  { pattern: /git\s+checkout\s+--\s+\./, reason: "Discarding all changes; ask the user" },
  { pattern: /rm\s+-rf?\s+(\/|~|\.\.|\$HOME)/, reason: "Recursive delete outside the project is forbidden" },
  { pattern: /vercel\s+[^\n]*--prod/, reason: "Production deployments happen through GitHub, never from a shell" },
  { pattern: /vercel\s+deploy/, reason: "Deployments happen through GitHub, never from a shell" },
  { pattern: /(^|\s)sudo(\s|$)/, reason: "sudo is forbidden" },
  { pattern: /curl[^\n]*\|\s*(ba)?sh/, reason: "Piping remote scripts into a shell is forbidden" },
];

const payload = await readPayload();
const input = payload.tool_input as BashInput | undefined;
if (!input?.command) process.exit(0);

const command = input.command;
if (/^ALLOW_PUSH=1\s+git\s+push(?![^\n]*(--force|-f\b))/.test(command.trim())) process.exit(0);

for (const { pattern, reason } of deniedPatterns) {
  if (pattern.test(command)) block(`Command rejected: ${reason}\nCommand: ${command}`);
}
