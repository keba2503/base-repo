---
status: accepted
date: 2026-09-05
---

# 0005 No comments in code

## Context

Comments drift from code, hide unclear names and are where agents dump narration. The owner of this base forbids them without exception.

## Decision

No comment syntax of any kind in any file: script comments, JSX comments, CSS comments, HTML comments, hash comments in configuration. Scaffolded files are cleaned. The architecture check rejects them before write, at commit and in CI.

## Consequences

- Meaning lives in names, types, tests and decision records.
- Generated files that cannot be controlled, such as `next-env.d.ts`, are excluded from version control.
