import { readPayload } from "./hook-input";

await readPayload();
console.log(
  [
    "Repository rules in force: dependency rule (architecture/layers.json), zero comments, no any, process.env only in src/main, bun only, no push unless asked.",
    "Before writing code, read the node for the layer you touch: docs/layers/<layer>.md. Adding functionality follows docs/workflow/new-feature.md.",
  ].join("\n"),
);
