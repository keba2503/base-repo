@AGENTS.md

## Claude Code specifics

Path scoped rules load automatically from `.claude/rules/` when you open files in a ring. Hooks in `.claude/settings.json` reject forbidden writes and commands and block stopping while `bun run check` fails.

Agents: `architect` (design, opus), `implementer`, `layer-guardian`, `security-reviewer`, `test-writer`. Skills: `/new-feature`, `/new-port`, `/new-component`, `/adr`, `/gate`.

Delegate exploration and multi file implementation to agents; keep this conversation for decisions and synthesis.
