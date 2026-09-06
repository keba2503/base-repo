# Base Repo

## Purpose

This is a **base repository**, not an application. It exists to be derived: clone it, rename the scope, and start a real project on top of a Clean Architecture skeleton that already enforces its own rules in CI and at commit time.

The architecture follows Robert C. Martin's Clean Architecture. The dependency rule is absolute: source code dependencies only ever point inward, toward higher-level policy. The graph of who may import whom lives in a single file, `architecture/layers.json`, and every other tool (the architecture checker, dependency-cruiser, ESLint) reads from it instead of encoding the rule twice.

## Stack

- Next.js 16 (App Router, React Compiler, Turbopack)
- React 19
- TypeScript 5, strict mode
- Tailwind CSS v4
- bun (package manager, test runner, script runner)
- dependency-cruiser (architecture graph enforcement)
- lefthook (git hooks) and commitlint (Conventional Commits)
- GitHub Actions (CI, CodeQL, secret scanning), Dependabot
- Vercel (deployment target)

## Requirements

- bun 1.3 or newer
- Node.js is not required to develop; bun runs TypeScript directly

## Getting started

This repository is meant to be derived, not run as-is:

1. Use it as a template (GitHub "Use this template") or clone it into a new directory.
2. Rename the scope: replace `@base` in `architecture/layers.json`, `tsconfig.json`, and any `package.json` name fields with your project's scope.
3. Update `.github/CODEOWNERS` and `SECURITY.md` with the new owners and contact.
4. Run `bun install`.
5. Start building inside `packages/domain` outward; see the layer table below.

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Runs the web app in development |
| `bun run build` | Builds every workspace |
| `bun run lint` | Lints every workspace |
| `bun run typecheck` | Type-checks every workspace |
| `bun run arch` | Runs the architecture checker (comments, `any`, `process.env`, layer imports) |
| `bun run depcruise` | Runs dependency-cruiser against the layer graph |
| `bun run test` | Runs the test suite (`bun test`) |
| `bun run check` | Runs `lint`, `typecheck`, `depcruise`, `arch`, and `test` in sequence; this is the single gate CI and `pre-push` both call |

## Repository layout

```
apps/web            Next.js application (delivery mechanism)
apps/worker         background worker (delivery mechanism, not yet scaffolded)
packages/domain     entities and business rules
packages/application  use cases, orchestrates domain
packages/contracts  shared request/response schemas (zod)
packages/adapters   interface adapters: controllers, presenters, gateways
packages/infrastructure  frameworks and drivers: database, external services
scripts/architecture  the layer graph reader and the checker that enforces it
architecture/layers.json  the single source of truth for the dependency graph
```

### Layer rules

| Layer | May import | Notes |
| --- | --- | --- |
| `domain` | nothing | no external packages allowed |
| `application` | `domain` | no external packages allowed |
| `contracts` | `domain` | only `zod` as an external dependency |
| `adapters` | `application`, `domain`, `contracts` | only `zod`; never `next`, `react`, `react-dom`, `drizzle-orm`, `@supabase/*`, `hono` |
| `infrastructure` | `application`, `domain` | never `next`, `react`, `react-dom`; this is the only layer allowed to read `process.env` besides each app's `src/main` |
| `apps/web` | `adapters`, `contracts`, `infrastructure`; `application` and `domain` only from `apps/web/src/main` | delivery mechanism |
| `apps/worker` | `adapters`, `infrastructure`; `application` and `domain` only from `apps/worker/src/main` | delivery mechanism |

Any change to this table starts in `architecture/layers.json`, not in prose.

## Quality gates

Three layers of the same gate, from fastest feedback to slowest:

1. **`pre-commit` (lefthook)**: on staged files, in parallel, ESLint (`--max-warnings 0`) and the architecture checker; then `bun run typecheck`.
2. **`commit-msg` (lefthook + commitlint)**: rejects commit messages that are not Conventional Commits.
3. **`pre-push` (lefthook)**: runs `bun run check` in full before the push leaves the machine.
4. **CI (GitHub Actions, `.github/workflows/ci.yml`)**: on every pull request and on push to `main`, runs `bun run check` and `bun run build`, a `gitleaks` secret scan, and `bun audit`. `.github/workflows/codeql.yml` runs CodeQL static analysis for JavaScript/TypeScript on the same triggers plus a weekly schedule.

Nothing here should ever be weakened to make a change pass; if a rule is wrong, change `architecture/layers.json` and write it down.

## Deployment

Deployment target is always Vercel, connected to this GitHub repository (preview deployments per pull request, production from `main`). There is no root `vercel.json`: a monorepo with a single app does not need one, and the two settings below belong in the Vercel dashboard, not in a committed file.

In the Vercel project dashboard, under **Settings → Build and Deployment**:

- **Root Directory**: `apps/web`
- **Install Command**: run from the repository root so the workspace lockfile is respected, e.g. `cd .. && bun install --frozen-lockfile`
- **Framework Preset**: Next.js (auto-detected once Root Directory is set)

Recommended branch protection on `main` (GitHub repository settings):

- Require a pull request before merging
- Require status checks to pass before merging: `check`, `secrets`, `codeql`
- Do not allow force pushes
- Require a linear history

## Security

- Security headers are set in `apps/web/next.config.ts`: `Strict-Transport-Security` (2 years, `includeSubDomains`, `preload`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy` (camera, microphone, geolocation, and payment all denied), `X-Frame-Options: DENY`, and `poweredByHeader: false`.
- Content Security Policy is nonce-based and generated per request in `apps/web/src/proxy.ts`, following the Next.js Proxy convention (the successor to `middleware.ts` in Next.js 16). Development mode allows `'unsafe-eval'` for React's debugging support; production does not. A page must opt into dynamic rendering (for example with `connection()` from `next/server`) for the nonce to actually reach its scripts — static pages will still receive the header, but without a nonce baked into their markup.
- `process.env` access is restricted by the architecture checker to `apps/*/src/main`; `apps/web/src/main/env.ts` is the one place that reads `NODE_ENV` to decide the CSP's dev/prod behavior.
- Report a vulnerability by following `SECURITY.md` (email `keba2503@gmail.com`).

## Structure

`ESTRUCTURA.md` describes, in Spanish, every directory of the tree and the role it plays, plus where the pieces that do not exist yet will live. It is verified by `bun run structure`, which is part of `bun run check`: a directory that is not described there fails the gate.

## Agentic workflow

See `AGENTS.md`.
