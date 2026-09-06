export type DenyRule = { readonly pattern: RegExp; readonly reason: string };

export const deniedPatterns: readonly DenyRule[] = [
  { pattern: /(^|[\s;&|])(npm|pnpm|yarn|npx)(\s|$)/, reason: "Only bun is allowed in this repository" },
  { pattern: /(^|[\s;&|])bunx\s+playwright@/, reason: "Run the pinned playwright, never a version fetched on the fly" },
  { pattern: /(^|[\s;&|])bunx\s+(?!playwright(\s|$))/, reason: "bunx runs a package that is not in bun.lock; add it as a devDependency and call it through bun run" },
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

const statedPush = /^ALLOW_PUSH=1\s+git\s+push(?![^\n]*(--force|-f\b))/;

export function rejectionFor(command: string): string | undefined {
  if (statedPush.test(command.trim())) return undefined;
  for (const { pattern, reason } of deniedPatterns) {
    if (pattern.test(command)) return reason;
  }
  return undefined;
}
