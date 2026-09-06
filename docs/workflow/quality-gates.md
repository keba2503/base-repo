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
| GitHub Actions | pull request and push to main | install with frozen lockfile, `bun run check`, build, `bun run ui` (its own job), secret scan, CodeQL, dependency audit | none, required checks |
| Vercel | every deployment | production build | none |

## `bun run check`

The `check` script in `package.json` is the one source of truth for which gates run and in what order; read it there, not here. What each gate is for:

- **lint**, **typecheck**: what a linter and a type system are for.
- **depcruise**, **arch**: enforce the dependency rule and the hard rules (no comments, no `any`, `process.env` only in `src/main`) by reading actual imports and syntax, not by trusting someone remembered the rule.
- **structure** (`bun run structure`): fails when a tracked directory has no line in `ESTRUCTURA.md`, or when `ESTRUCTURA.md` describes a directory that no longer exists. The map stays true because it is checked on every run, not because whoever removed a directory also remembered to edit the doc.
- **env-example** (`bun run env-example`): fails when a variable an `apps/*/src/main/env.ts` requires in production is missing from `.env.example`. Whoever deploys reads that file to know what to set; this gate keeps it from silently falling behind the code, the same way `structure` keeps `ESTRUCTURA.md` honest.
- **defects** (`bun run defects`): fails when a file in `docs/defects/` is missing the declaration of how it is prevented from happening again, carries a value other than `gate`, `test` or `none`, names a test file that does not exist on disk, or names a gate that is not among the repository's own scripts. A review finding what to fix is not the hard part; deriving the right gate from it is, and that step is not automated — what this check makes mechanical is that the question always gets asked and the answer is checked against the repository, not trusted as prose. See `docs/defects/README.md` for the exact shape.
- **test**: the whole suite, `bun test`.

Each gate stops the chain at its first failure.

## `bun run ui`

`scripts/ui/viewport.ts` boots the web app, visits every static route, and fails on horizontal overflow, a tap target under 44px, form field text under 16px, or a label overlapping the field it labels — see `docs/layers/web.md` for exactly what it measures and what it cannot.

It is not part of `bun run check`, on purpose, and it is not one of the checks the agent hooks or lefthook run either. It needs a Chromium binary Playwright has downloaded, and that download does not exist yet on a fresh clone, in a derived project's first `bun install`, or in most local shells. A gate that fails on every clean checkout because of a few hundred megabytes nobody asked to download is not a gate anyone trusts; it gets skipped or disabled instead of fixed, which is worse than not having it. If the browser is missing, the script says so and names the exact command to fix it (`bunx playwright install chromium`) rather than failing with a stack trace.

It still runs on every pull request and push to main, as its own job in `.github/workflows/ci.yml`, with its own browser-install step — a real, required gate, just one that does not have to run on every local save. This is the same reasoning already applied to the contract suites against real providers in `packages/infrastructure/test`: not every check that matters has to run on every commit, only on every commit that reaches CI.

## When a gate blocks you

Read the message. It names the file, the line and the rule. Fix the cause. Do not weaken the rule, do not add an exception, do not disable the gate. If the rule is wrong, write a decision record proposing the change and stop.
