---
status: accepted
date: 2026-09-08
---

# 0029 The GitHub Actions dispatch trigger is opt-in per repository, and off in this base

## Context

Decision 0028 shipped `.github/workflows/cron-dispatch.yml` as one of three interchangeable triggers for `POST /api/cron/dispatch`, scheduled every five minutes and failing loudly when `CRON_DISPATCH_URL` or `CRON_SECRET` is missing. Failing on a missing secret was the right call for a repository that deploys: a queue that silently stops draining is worse than a red run.

This repository does not deploy. It is the base every project derives from, it has no Vercel project behind it and no secrets configured, so the workflow has been failing every five minutes since it was merged, and GitHub emails the failure to whoever last touched the schedule — roughly 288 identical failure notices a day, none of which describe a real problem. The signal is not just noisy, it is inverted: the one alert channel that should mean "the queue is stuck" now means "this is the base repository, as always".

Three ways out were considered:

- **Exit zero when the secrets are absent.** Stops the mail, and destroys the gate: a derived project that deploys and forgets one secret would show green forever, which is exactly the silent-queue failure 0028 refused.
- **Delete the `schedule:` trigger from the base and tell derived projects to add it.** Stops the mail, but hands every derived project a workflow that does nothing until someone edits its YAML, and an edit is easy to forget in a way that flipping a documented switch is not.
- **Keep the workflow and its failure exactly as they are, and make the schedule itself conditional on the repository declaring that it wants this trigger.**

## Decision

The `dispatch` job runs only when the repository variable `CRON_DISPATCH_ENABLED` is `true`, or when a human started the run by hand:

```yaml
if: github.event_name == 'workflow_dispatch' || vars.CRON_DISPATCH_ENABLED == 'true'
```

A repository variable, not a secret and not a fourth `if` inside the shell script: `vars` is one of the few contexts available in a job-level `if`, so the guard removes the job from the run instead of dressing a failure up as a success. In this base, where nobody set the variable, every scheduled run is a skipped job — no runner minutes, no red X, no mail. In a derived project the variable is one switch in the repository settings, alongside the two secrets that trigger already needs.

Nothing about the failure is softened. Once `CRON_DISPATCH_ENABLED` is `true`, a missing `CRON_DISPATCH_URL` or `CRON_SECRET` fails the job exactly as decision 0028 wrote it, and so does a dispatch call that the route rejects. The manual half of the condition exists so that the guard can never hide a misconfiguration from someone looking for it: clicking **Run workflow** in a repository that never set the variable still runs the job, and it still fails saying the two secrets are required, which is the fastest way to check a derived project's wiring before turning the schedule on.

This is the same shape as rule 14 of `AGENTS.md`, one ring out: a trigger that is off is never mounted, rather than mounted and taught to return early.

The guard does open one failure the loud version did not have: a derived project that sets both secrets and forgets the variable gets a queue nothing drains, and no red run to say so — the very silence 0028 refused. A second job in the same workflow closes it, on its own daily `41 7 * * *` entry (jobs tell the two schedules apart through `github.event.schedule`, so the five-minute tick never runs it). It fails, loudly, whenever either `CRON_DISPATCH_URL` or `CRON_SECRET` is configured and `CRON_DISPATCH_ENABLED` is not `true`, which covers every state where the guard could be hiding a stopped queue, the half-configured one included. It is the one state a workflow can detect on its own: nothing in a repository can know whether a project intends to deploy, but a repository that already holds the dispatch secrets has answered that question. In this base, which holds neither secret, that job passes silently once a day.

## Consequences

- The base repository stops mailing a failure every five minutes, and a red `Cron dispatch` run means again what 0028 wanted it to mean.
- A derived project enabling this trigger now sets one variable and two secrets rather than two secrets; `README.md` documents all three together, which is more than the trigger had before.
- A derived project that sets the secrets and forgets the variable is caught within a day by the `configuration` job, not left silent; the manual `workflow_dispatch` path makes the same check available in one click, before the first daily run. What neither can catch is a project that intends to deploy and has configured nothing at all yet, which is indistinguishable from this base repository and always will be.
- Scheduled runs still appear every five minutes in the Actions tab as skipped jobs, plus one passing daily configuration run. Removing them entirely would mean deleting the `schedule:` block, which is the option this decision rejected.
- The shape this decision chose is now a gate rather than a habit: `bun run workflows` (`scripts/architecture/check-workflows.ts`, in `bun run check`) rejects any job that reads a secret inside a workflow with a `schedule:` trigger and carries no `if:` of its own, which is exactly the shape the original workflow had. It measures the decision, never the deployment behind it — a repository that intends to deploy and has configured nothing is indistinguishable from this base, and no gate reading this tree will ever tell them apart.
