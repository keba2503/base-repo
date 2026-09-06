---
read-when: starting a derived project's visual design, or reviewing a new view before it ships
related: [../layers/web, ../../.claude/skills/design-direction]
---

# Design

This repository imposes discipline, never aesthetics. It does not choose a palette, a typeface, a layout style or a tone of voice for anything derived from it — that choice belongs to whoever builds the actual product, and `docs/layers/web.md` already says the placeholder tokens in `globals.css` exist to be replaced, not kept. What follows is not a style. It is a list of reflexes to refuse, and a distinction between a reflex and a decision.

## A veto is not a style opinion

Every rule below forbids a *default* — something a model or a tired developer reaches for because it is the median of everything it has seen, not because it serves this particular project. None of them forbid the same visual outcome when it is a deliberate choice, made against a stated idea and defensible against it. Three equal cards can be exactly right for a comparison table; three equal cards reached for because a section needs "three things" is the default this document exists to block. The difference is whether someone can say *why*, against something more specific than "it looks fine."

## Composition reflexes to refuse

- Filling a whole viewport width because there is space, rather than because a decision needs that space. Empty space is a choice, not a failure to reach the edges.
- Centering an entire section by default. Centering is the layout equivalent of not deciding: it is the right call sometimes, and the wrong call every time it was never actually considered against the alternative.
- Reaching for a fixed number of identical cards (three, most often) each holding an icon, a title and a paragraph, as the default shape for "a few related things." It is legitimate for a genuinely uniform, comparable set; it is a tell when the content was bent to fit the shape instead of the other way around.
- A grid where every section carries the same padding, the same width, the same visual weight, top to bottom. A page with no rhythm reads as a list of sections, not as something someone designed.
- Giving everything the same visual weight. If nothing is heavier than anything else, there is no hierarchy — only inventory.

## Surface reflexes to refuse

- A form or a modal where declining costs more steps, more scrolling or more reading than accepting. A consent choice, in particular, is not a real choice unless both options cost the same.
- Color as the only signal for state (required, error, selected). It fails anyone who cannot distinguish the colors involved, and it is also just less informative than a second cue.
- Reflexive rounding, shadow and border applied uniformly across every card, button and input because a component library defaults to it, rather than chosen per element for a reason tied to the project's own idea.

## What this repository will not do instead

- It will not name a font, a palette, a spacing scale or a border radius. `globals.css` ships with whatever Next.js scaffolds by default precisely so nobody mistakes it for a decision made on a derived project's behalf.
- It will not prescribe a component's look. `src/ui` in a derived project holds real components with a real, chosen appearance; this repository only holds the seam that stops two views from growing two different ones.
- It will not soften the reflexes above into "best practices" with escape hatches baked in for convenience. An escape hatch is fine — it is a decision someone made and can defend, not a checkbox this document ticks for them.

## Before a derived project builds its first screen

1. Write, in one paragraph, who opens this and what they should feel in the first two seconds — in physical verbs (breathe, slow down, lean in), not adjectives like "modern" or "clean."
2. Name one governing idea the whole project is judged against — a tension or a metaphor concrete enough that a visual choice can fail it. "Professional and trustworthy" fails this test; it fits every SaaS product ever built and rules out nothing.
3. Replace every token in `globals.css`'s `@theme` block with the project's own before writing a single view. Building against the placeholders and restyling later is a rewrite, not a restyle.
4. Load `.claude/skills/design-direction` before the first interface is written, not after a first draft needs to be undone. It does not hand back a style; it forces the decision above to exist before the model has to improvise one.
