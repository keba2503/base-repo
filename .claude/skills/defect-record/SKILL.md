---
name: defect-record
description: Write a defect record in docs/defects after a review finds something. Use when layer-guardian or security-reviewer report a finding, or any review catches a real mistake that reached the tree.
argument-hint: [what went wrong]
---

What went wrong: $ARGUMENTS

Read docs/defects/README.md. Take the next `DEF-NNNN` id, name the file `DEF-NNNN-slug.md`.

Answer, in order:

1. **What happened.** One paragraph, no blame.
2. **The hard question: from what existing gate or test should this have been caught, and why wasn't it?** Look for the gate that was close but did not cover this case, not for who wrote the bug. If the honest answer is "no gate could plausibly have caught this without inventing a mechanism that does not belong in this repository," that is a legitimate answer — write it as the reason.
3. **How it is prevented from happening again**, exactly one of:
   - a gate now rejects this class of mistake — name the script under `scripts/`,
   - a test now fixes the correct behaviour — name the `.test.ts` file,
   - neither exists, with the reason written out.

Fill the frontmatter (`id`, `date`, `found_in`, `prevented_by`, and the one matching field) exactly as `docs/defects/README.md` specifies — `bun run defects` checks it against the repository, not against prose, so a named gate or test must actually exist on disk before you write it down.

Do not invent a gate or a test to make the frontmatter look complete. An honest `prevented_by: none` teaches more than a `prevented_by: test` pointing at a file that does not exist.
