---
name: component-source
description: Bring in a component that does not exist yet in apps/web/src/ui, from an unstyled primitives library via the official shadcn registry. Handles accessibility, focus, keyboard and state; never decides how anything looks. Use when a view needs a control apps/web/src/ui does not have yet.
argument-hint: [component name]
---

Component needed: $ARGUMENTS

## What this skill is for, and what it is not

This skill resolves **implementation**: a correct, accessible, keyboard-operable primitive with the right ARIA roles and focus behaviour, added once to `apps/web/src/ui` for everyone to reuse. It never resolves **design**. shadcn's own component set is today's most repeated template on the internet; treating it as a source of visual criteria would install exactly the mediocrity `docs/standards/design.md` exists to block. The look of whatever gets built here is decided by `.claude/skills/design-direction` and `docs/standards/design.md`, before or after this skill runs, never by this one. If a copied component arrives with an opinionated look, strip it down to structure and behaviour and let the project's own tokens style it.

## Picking a library

Two unstyled primitive libraries are current as of 2026: **Base UI**, from the team that built Radix, is shadcn's default registry target since July 2026 and the actively developed successor; **Radix** is still maintained and fully supported but no longer the default, its pace slower. Prefer Base UI for a new component unless the project already has Radix primitives in `apps/web/src/ui`, in which case match what is already there rather than mixing both. **React Aria** (Adobe) is the strictest option on accessibility; reach for it specifically when a component's a11y requirements are the hard part (complex listboxes, date pickers, combobox patterns) and the default choice's behaviour genuinely falls short — not by default. Verify this is still current before trusting it; libraries move fast.

## The real risk: copied code, not an installed dependency

shadcn does not install a package. Its CLI **copies source code into this repository**, unsigned, unchecksummed. From that point it is our code, not a dependency someone else patches when it turns out to be wrong. Supply-chain attacks that plant malicious code inside exactly this kind of copy-in-place flow are a documented, recurring pattern in the npm ecosystem — treat every copied file as untrusted until reviewed, the same way any other unreviewed patch would be.

Non-negotiable, no exceptions:

1. **Only the official shadcn registry.** A third-party or community registry is forbidden unless a decision record in `docs/decisions` justifies that specific one.
2. **Read the diff of every file the CLI adds or changes before accepting it.** Know what it does, not just that it ran without errors.
3. **Assume it violates repository rules on arrival, because it almost always does.** Before it is accepted: strip every comment, replace every `any`, replace every raw color/spacing/radius value with the project's own tokens from `globals.css`. Adapt it before it lands in `apps/web/src/ui`, not as a follow-up.
4. **bun only, never `npx`** — the agent hooks already block `npx` outright. Run the shadcn CLI through `bunx`. Watch for it: the CLI sometimes misdetects the package manager and writes a `package-lock.json` even in a bun project; if that file appears, delete it before committing.

## Steps

1. Confirm the component genuinely does not exist in `apps/web/src/ui` yet.
2. Pick the library per the section above; state which and why in one line.
3. Run the CLI with `bunx` against the official registry only.
4. Read every diff. Reject anything that reaches outside the component being added.
5. Strip comments, remove `any`, replace raw values with tokens. Delete a stray `package-lock.json` if the CLI wrote one.
6. Move the result into `apps/web/src/ui`, export it from the barrel, and confirm `scripts/architecture/check-source.ts` and `scripts/ui/viewport.ts` both pass on it.
