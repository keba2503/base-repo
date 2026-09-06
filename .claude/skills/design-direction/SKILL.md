---
name: design-direction
description: Force a design decision to exist before any interface is written. Names the governing idea, gathers real references, and states what the result will be judged against. Never decides the actual look. Use before writing a new UI from scratch, or before a visual redesign of an existing one.
argument-hint: [project or section]
---

Direction needed for: $ARGUMENTS

This skill does not choose a look. It stops the model from improvising one by making a person decide these things first, per `docs/standards/design.md`.

1. Ask who opens this, on what device, and what they should feel in the first two seconds — physical verbs (breathe, slow down, lean in, hesitate), never adjectives like "modern" or "clean." Stop and wait for the answer; do not guess it.
2. Ask for one governing idea: a concrete tension or metaphor specific enough that a visual choice can fail it. Reject a governing idea that would fit any competitor in the same category unchanged.
3. Ask for two or three real reference URLs (not descriptions of taste) that show the direction, and say which parts of each are the reason it was picked.
4. From the references and the governing idea, state explicitly what gets judged against what: which reference settles typography, which settles motion, which settles density. Write this down before any component exists.
5. Confirm `globals.css`'s `@theme` tokens have already been replaced with the project's own (`docs/layers/web.md`); this skill assumes real tokens exist, it does not pick them.
6. Stop here. Do not propose colors, components or layouts in this skill — that is the next step, done with the answers above in hand, not instead of them.
