---
read-when: closing out a defect found in review, or wondering whether one already has a gate against it
related: [../decisions/README, ../workflow/quality-gates]
---

# Defect registry

One file per defect a review found, named `DEF-NNNN-slug.md`. A review does not close until its defect exists here, and the file names how it is prevented from happening again — checked by `bun run defects`, part of `bun run check`.

## Metadata

Every file opens with frontmatter, one `key: value` pair per line, between two `---` markers:

```
---
id: DEF-0001
date: 2026-09-06
found_in: where the review that found it happened
prevented_by: gate | test | none
gate: scripts/path/to/the-script.ts     (only when prevented_by is gate)
test: packages/path/to/the.test.ts      (only when prevented_by is test)
reason: why it cannot be measured       (only when prevented_by is none)
---
```

`prevented_by` admits exactly three answers, nothing else:

- **gate** — a script under `scripts/` now rejects this class of mistake. Name it in `gate`; the checker fails if that path does not exist among the repository's own scripts.
- **test** — a test now fixes the correct behaviour. Name the `.test.ts` file in `test`; the checker fails if it does not exist on disk.
- **none** — nothing mechanical catches this, and `reason` says why in a sentence a reviewer can judge. This is a legitimate answer, not a failure to try; a registry that only contains successes teaches nothing.

The body is free-form markdown, but it always answers one question beyond what happened: **why did no existing gate see this**. That is the part that teaches, because it points at the hole in the system, not at whoever made the mistake.

## Why this shape

The claim in the frontmatter is checked against the repository, not trusted as prose. A defect can say it is covered by a test that does not exist, or by a gate that was never written — a plain paragraph would never catch that. Keeping the format to flat `key: value` lines, with no nested structure, means `scripts/architecture/check-defects.ts` parses it with the same string-splitting approach `check-structure.ts` already uses for `ESTRUCTURA.md`, no YAML dependency needed, and the shape stays unambiguous enough for a program to reject silently wrong metadata rather than only checking that text exists.
