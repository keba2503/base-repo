---
status: accepted
date: 2026-09-11
---

# 0031 The stop hook runs `check:fast`, the full check runs once at pre-push and CI

`scripts/agent/stop.ts` used to run the full `bun run check` every time an agent stopped with a dirty tree. In Claude Code a project `Stop` hook also runs inside every subagent as `SubagentStop`, so a single turn with N subagents paid the full 20-second check N+1 times: the workers, who only produce code, were burning the same verification cost as the leader who pushes. The structural gates (arch, structure, env-example, defects, workflows) measure repository shape, not the code a turn touched, and together they cost under a second; the expensive gates are lint, typecheck and the test suite, which are exactly the ones that must run before any agent stops.

The stop hook now runs `check:fast` (lint, typecheck, depcruise, tests). Nothing is weakened: the full `bun run check` remains the required gate at pre-push and CI, so only the leader — the turn that commits and pushes — pays for the structural checks once, at the moment they have value. This is a repartition of when gates run, not a gate removal; no gate was weakened to make anything pass.