---
status: accepted
date: 2026-09-09
---

# 0031 Code scanning stays as it is, and a private derivative either buys it or turns it off

## Context

`.github/workflows/codeql.yml` runs CodeQL on every pull request, on every push to `main` and once a week, and uploads its results through `security-events: write`. On a public repository that upload is free. On a private one it is part of GitHub Code Security, a paid product: without it the `github/codeql-action/analyze` step fails when it tries to upload, so every pull request in a fresh private derivative carries a red `codeql` check that says nothing about the code.

The first project derived from this base hit exactly that, and the red check is worse than it looks. `README.md` recommends requiring `check`, `secrets` and `codeql` as status checks on `main`; a check that can never go green either blocks every merge or teaches whoever set it up to stop reading it.

Three ways out were considered:

- **Make the workflow tolerate the failure**, with `continue-on-error` on the analyze step or a shell fallback that swallows the upload's exit code. The check turns green, nothing is scanned, and rule 6 of `AGENTS.md` is broken in the most expensive way there is: a gate that reports success without measuring anything is worse than no gate, because it also removes the reason to add a real one.
- **Delete the workflow from the base** and let each project add it back. Every derived project would then start with no static analysis at all, and the ones that could have had it for free — public repositories — would be the ones paying for the default.
- **Keep the workflow exactly as it is and make the cost visible at derivation time.**

## Decision

The workflow does not change. A derived repository decides, once, which of the two honest states it is in:

- **Public, or private with GitHub Code Security enabled** — nothing to do. CodeQL runs and its result means what it says.
- **Private without it** — disable the CodeQL workflow under **Actions → CodeQL → Disable workflow**, and drop `codeql` from the required status checks on `main`. Nothing is scanned, and nothing pretends to be.

`README.md` says this in the derivation steps, where the decision actually has to be made, rather than in a security section nobody reads while creating a repository.

Turning a workflow off from the Actions tab, rather than deleting the file, is deliberate. The file stays in the tree as the thing to switch back on the day the repository goes public or the plan changes, and the difference between "we do not scan" and "we scan" remains one toggle rather than a commit someone has to write from memory.

## Consequences

- A private derivative shows no red `codeql` check, and does so by admitting it is not scanning rather than by faking a scan.
- The base repository, which is public, keeps CodeQL on its own pull requests unchanged.
- Nothing in the tree can enforce this: whether a repository is private, and whether its account has Code Security, lives in GitHub's settings, not in any file a gate can read. This is the same boundary decision 0029 ran into with the dispatch trigger, and it is recorded in `docs/defects/` as prevented by nothing, with that as the reason.
- If a future derivative wants scanning without GitHub Code Security, the replacement is another analysis that runs and reports in the job itself instead of uploading to the security tab. That would be a new decision, not an edit to this one.
