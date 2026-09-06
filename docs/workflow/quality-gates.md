---
read-when: something blocks a write, a commit, a push or a stop; or configuring CI
related: [../standards/code-style, ../standards/testing, ../architecture/dependency-rule]
---

# Quality gates

Four gates, fastest first. Each one runs the same checks; the later ones only exist because the earlier ones can be bypassed.

| Gate | When | What runs | Bypass |
| --- | --- | --- | --- |
| Agent hooks | before every file write, every shell command, and before an agent stops | architecture check on the content about to be written; command deny list; full `bun run check` on stop when the tree is dirty | none |
| lefthook | pre-commit, commit-msg, pre-push | eslint and architecture check on staged files, typecheck, conventional commit message, full check before push | `--no-verify`, forbidden by the agent hook |
| GitHub Actions | pull request and push to main | install with frozen lockfile, `bun run check`, build, secret scan, CodeQL, dependency audit | none, required checks |
| Vercel | every deployment | production build | none |

## `bun run check`

The `check` script in `package.json` is the one source of truth for which gates run and in what order; read it there, not here. What each gate is for:

- **lint**, **typecheck**: what a linter and a type system are for.
- **depcruise**, **arch**: enforce the dependency rule and the hard rules (no comments, no `any`, `process.env` only in `src/main`) by reading actual imports and syntax, not by trusting someone remembered the rule.
- **structure** (`bun run structure`): fails when a tracked directory has no line in `ESTRUCTURA.md`, or when `ESTRUCTURA.md` describes a directory that no longer exists. The map stays true because it is checked on every run, not because whoever removed a directory also remembered to edit the doc.
- **env-example** (`bun run env-example`): fails when a variable an `apps/*/src/main/env.ts` requires in production is missing from `.env.example`. Whoever deploys reads that file to know what to set; this gate keeps it from silently falling behind the code, the same way `structure` keeps `ESTRUCTURA.md` honest.
- **test**: the whole suite, `bun test`.

Each gate stops the chain at its first failure.

## When a gate blocks you

Read the message. It names the file, the line and the rule. Fix the cause. Do not weaken the rule, do not add an exception, do not disable the gate. If the rule is wrong, write a decision record proposing the change and stop.
