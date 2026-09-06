---
status: accepted
date: 2026-09-06
---

# 0027. Component source is copied by hand, never through an unpinned CLI

## Context

`.claude/skills/component-source` told the agent to run `bunx shadcn@latest add ...` to bring an unstyled primitive into `apps/web/src/ui`. A security review of that skill found that `bunx` was not in the deny list of `scripts/agent/pre-bash.ts`, which rejects `npm`, `pnpm`, `yarn` and `npx`.

`bunx shadcn@latest` resolves and executes a package that appears in neither `package.json` nor `bun.lock`: no pinned version, no lockfile entry, no record of what ran. It executes with the agent's own privileges before it writes a single file. The skill already required reading every file the CLI produced, but that covers the output, not the runtime that produced it. A typosquat or a compromised release of the package would run first and be read afterwards.

Hard rule 4 of `AGENTS.md` exists to close exactly this: bun only, never npm, pnpm, yarn or npx. The skill reopened it under a different command name.

## Decision

The skill no longer uses a CLI. The component's source is read in its official documentation and copied into `apps/web/src/ui` by hand, line by line. Runtime dependencies the component genuinely needs are installed pinned, with `bun add`.

`scripts/agent/pre-bash.ts` rejects `bunx` for any package other than `playwright`, and rejects a version specifier even for that one, so the pinned binary is the only thing it can run.

The cost of copying by hand is close to zero. A primitive is a few dozen lines, and the skill already required reading every one of them. Reading them in the browser instead of after the fact removes the execution vector entirely rather than auditing around it.

`bun run browsers` replaces the direct `bunx playwright install` in continuous integration, so the browser download also goes through the pinned dependency.

## Consequences

Adding a primitive takes a few more minutes and cannot be automated end to end. That is the point: the step that cannot be automated is the one where someone reads what is about to become their own code.

If a future component ever justifies a CLI, it is pinned as a devDependency and invoked through `bun run`, and that decision gets its own record.
