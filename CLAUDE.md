@AGENTS.md

## Claude Code specifics

Path scoped rules load automatically from `.claude/rules/` when you open files in a ring. Hooks in `.claude/settings.json` reject forbidden writes and commands and block stopping while `bun run check` fails.

Agents: `architect` (design, opus), `implementer`, `layer-guardian`, `security-reviewer`, `test-writer`. Skills: `/new-feature`, `/new-port`, `/new-component`, `/adr`, `/gate`.

Delegate exploration and multi file implementation to agents; keep this conversation for decisions and synthesis.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
