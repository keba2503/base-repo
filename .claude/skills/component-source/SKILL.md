---
name: component-source
description: Bring in a component that does not exist yet in apps/web/src/ui, from an unstyled primitives library, copied by hand from its official documentation. Handles accessibility, focus, keyboard and state; never decides how anything looks. Use when a view needs a control apps/web/src/ui does not have yet.
argument-hint: [component name]
---

Component needed: $ARGUMENTS

## What this skill is for, and what it is not

This skill resolves **implementation**: a correct, accessible, keyboard-operable primitive with the right ARIA roles and focus behaviour, added once to `apps/web/src/ui` for everyone to reuse. It never resolves **design**. shadcn's own component set is today's most repeated template on the internet; treating it as a source of visual criteria would install exactly the mediocrity `docs/standards/design.md` exists to block. The look of whatever gets built here is decided by `.claude/skills/design-direction` and `docs/standards/design.md`, before or after this skill runs, never by this one. If a copied component arrives with an opinionated look, strip it down to structure and behaviour and let the project's own tokens style it.

## Picking a library

Two unstyled primitive libraries are current as of 2026: **Base UI**, from the team that built Radix, is shadcn's default registry target since July 2026 and the actively developed successor; **Radix** is still maintained and fully supported but no longer the default, its pace slower. Prefer Base UI for a new component unless the project already has Radix primitives in `apps/web/src/ui`, in which case match what is already there rather than mixing both. **React Aria** (Adobe) is the strictest option on accessibility; reach for it specifically when a component's a11y requirements are the hard part (complex listboxes, date pickers, combobox patterns) and the default choice's behaviour genuinely falls short — not by default. Verify this is still current before trusting it; libraries move fast.

## The real risk: copied code, not an installed dependency

shadcn does not install a package. It **copies source code into this repository**, unsigned, unchecksummed. From that point it is our code, not a dependency someone else patches when it turns out to be wrong. Supply-chain attacks that plant malicious code inside exactly this kind of copy-in-place flow are a documented, recurring pattern in the npm ecosystem — treat every copied file as untrusted until reviewed, the same way any other unreviewed patch would be.

Non-negotiable, no exceptions:

1. **Only the official shadcn registry.** A third-party or community registry is forbidden unless a decision record in `docs/decisions` justifies that specific one.
2. **Read every line before it lands.** Know what the component does, not just that it renders. A primitive touches focus, keyboard and ARIA; anything beyond that is out of place.
3. **Assume it violates repository rules on arrival, because it almost always does.** Before it is accepted: strip every comment, replace every `any`, replace every raw color/spacing/radius value with the project's own tokens from `globals.css`. Adapt it before it lands in `apps/web/src/ui`, not as a follow-up.
4. **No CLI. Copy the source by hand from the official documentation.** `bunx shadcn@latest` fetches and executes a package that is in no lockfile: unpinned, unaudited, running with the agent's own privileges before it writes a single file. Reading the files it produced afterwards does not cover the runtime that produced them. The hook in `scripts/agent/pre-bash.ts` rejects it. This costs almost nothing: a primitive is a few dozen lines, they have to be read line by line anyway per rule 2, and reading them in the browser instead of after the fact removes the entire execution vector. If a component ever justifies the CLI, pin it as a devDependency in `package.json` and call it through `bun run`, and write the decision record.

## Steps

1. Confirm the component genuinely does not exist in `apps/web/src/ui` yet.
2. Pick the library per the section above; state which and why in one line.
3. Open the component's page in the official documentation and read its source there. Note every runtime dependency it needs; those do get installed, pinned, with `bun add`.
4. Copy the source into `apps/web/src/ui` by hand, reading every line as you go. Anything that reaches outside the component itself, touches configuration or writes files does not belong in a primitive: stop and say so.
5. Strip comments, remove `any`, replace raw colors, spacing and radii with the project's tokens.
6. Export it from the barrel, and confirm `bun run check` and `bun run ui` both pass on it.
