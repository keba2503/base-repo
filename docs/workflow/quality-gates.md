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

`lint`, `typecheck`, `depcruise`, `arch`, `test`, in that order, stopping at the first failure.

## When a gate blocks you

Read the message. It names the file, the line and the rule. Fix the cause. Do not weaken the rule, do not add an exception, do not disable the gate. If the rule is wrong, write a decision record proposing the change and stop.
