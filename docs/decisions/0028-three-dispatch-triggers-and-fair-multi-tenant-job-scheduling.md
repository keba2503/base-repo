---
status: accepted
date: 2026-09-06
---

# 0028 Three dispatch triggers, and fair multi-tenant job scheduling

## Context

`apps/worker` is the only thing that ever called `dispatchOutbox` and `dispatchJobs`. It is a long-lived process, and the repository's only declared deployment target is Vercel, whose serverless functions cannot stay alive between requests. A derived project that deploys only to Vercel, as `README.md` instructs, has a queue and an outbox that nothing ever drains.

Three situations need the same dispatch to run, on different budgets:

- A free-tier demo, with decades of usage but no billing, where Vercel's Hobby plan is explicitly for non-commercial use and its cron feature fires at most once a day.
- Real production, on Vercel Pro (cron fires at most once a minute) and Supabase Pro.
- A future need for real throughput, where a container runs the existing `apps/worker` continuously.

`apps/worker` is untouched by this decision beyond adding the two building blocks it already had (a registry-scoped job queue, an outbox) to a second composition root. It remains the answer whenever real throughput is needed.

While building the second trigger, `claimDue`'s existing ordering surfaced a fairness bug: it claims strictly by `run_at, id`, globally. A tenant that enqueues ten thousand jobs pushes every other tenant's jobs to the back of one global line. That is unacceptable in a multi-tenant system and is fixed here at the same time, because the new HTTP trigger is what makes the bug visible in slow motion (a batch every minute, instead of a worker draining continuously).

## Decision

### 1. A protected dispatch route

`POST` and `GET /api/cron/dispatch` (`apps/web/src/app/api/cron/dispatch/route.ts`) runs one outbox batch and one job queue batch and returns their counts. It is deliberately not a contract-based operation like the rest of `apps/web/src/api`: there is no end-user actor here, no request body to validate against a zod contract, just a scheduler presenting a shared secret. The route is a thin call into `apps/web/src/main/cron-dispatch.ts`, which builds a `cronActor()` (`apps/web/src/main/actor.ts`, the same shape as the worker's `workerActor()`) and calls `dispatchOutboxOperation()` / `dispatchJobsOperation()`, two new composition functions in `apps/web/src/main/use-cases.ts` that wire `dispatchOutbox` and `dispatchJobs` exactly as `apps/worker/src/main/use-cases.ts` already does, against `apps/web`'s own container. No new business logic was written: this is the same two use cases the worker already calls, reached through a different delivery mechanism, which is the point of the exercise.

Reaching this required one addition to `apps/web`'s `Container`: a registry-scoped `jobQueue`, next to the tenant-scoped `jobsScopedTo` it already had (mirroring `tenantRegistry` next to `tenantsScopedTo`). Without it, the cron route could only ever see one tenant's jobs at a time.

Authorization is a single shared secret, `CRON_SECRET`, compared in constant time. The comparison in `apps/web/src/api/cron-secret.ts` does not call `timingSafeEqual` on the raw strings, because that function throws (and, worse, could be timed) when the two buffers differ in length, which a raw secret and a raw guess almost always do. Both sides are first hashed with SHA-256 to a fixed 32 bytes, then compared with `timingSafeEqual`; length can no longer leak anything, and the comparison itself is constant-time. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` to every cron target; GitHub Actions is configured to send the identical header with the identical secret, so both callers are authenticated the same way, by the same code path.

If `CRON_SECRET` is not configured, the route **fails closed** in production and **fails open** only outside it. This is enforced twice: `apps/web/src/main/env.ts` refuses to boot in production without `CRON_SECRET` (the same pattern already used for `SENTRY_DSN`, `TURNSTILE_SECRET`, `API_KEY_PEPPER`), and `apps/web/src/main/cron-dispatch.ts` treats a missing secret as "reject every call" whenever `NODE_ENV` happens to be production anyway. Failing open was rejected: this route mutates real queue state (marking events published, jobs completed) and, unauthenticated, would let anyone who finds the URL drain a tenant's outbox on their behalf or hammer the database with dispatch batches; a queue that silently sits full is a strictly safer failure than that.

Two overlapping calls (a slow Vercel Pro invocation next to a GitHub Actions retry, say) are already safe, unchanged: `claimDue` still runs inside its own transaction with `FOR UPDATE SKIP LOCKED` (now wrapping the fairness query below), so a row claimed by one caller is invisible to the other until released; nothing here needed to change for that guarantee to keep holding, and decision 0015 already established it for the single-worker case, which this route does not weaken.

The batch sizes (`CRON_DISPATCH_OUTBOX_BATCH_SIZE`, `CRON_DISPATCH_JOBS_BATCH_SIZE`, both defaulting to 25) are kept deliberately small, and the route declares `export const maxDuration = 60`, so a batch fits comfortably inside a serverless function's duration budget even on a cold start. The response carries `hasMoreWork: boolean`, true whenever a batch came back full (`pulled >= batchSize` or `claimed >= batchSize`), which is the caller's signal to call again immediately rather than wait for the next scheduled tick. The route itself does not loop internally to drain a backlog in one invocation: looping is the caller's job, because the caller is the one that knows its own duration budget (the GitHub Actions workflow below loops up to ten times per five-minute tick; Vercel Cron's own one-minute-minimum tick on Pro is treated as the retry loop for that trigger, with `hasMoreWork` only visible in logs).

### 2. Fair, round-robin claiming across tenants

`claimDue`'s ordering changes from a single, purely temporal `ORDER BY run_at, id` to a two-level scheme computed in SQL:

```sql
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY tenant_id, priority ORDER BY run_at ASC, id ASC
  ) AS turn
  FROM jobs
  WHERE completed_at IS NULL AND exhausted_at IS NULL AND run_at <= $1 [AND tenant_id = $2]
)
SELECT jobs.* FROM jobs JOIN ranked ON ranked.id = jobs.id
ORDER BY jobs.priority ASC, ranked.turn ASC, jobs.run_at ASC, jobs.id ASC
LIMIT $3
FOR UPDATE OF jobs SKIP LOCKED
```

`turn` is each job's position within its own tenant's (and priority's) queue: a tenant's oldest due job is always turn 1, regardless of how many jobs that tenant has queued behind it. Ordering the final claim by `turn` first, and only then by `run_at`, means every tenant's turn-1 job is claimed before any tenant's turn-2 job. A tenant with ten thousand pending jobs and a tenant with one now compete for the front of the line as equals, every round; the busy tenant simply keeps reappearing once its earlier jobs are gone, exactly as fairness requires, never starving the quiet one.

This was chosen in SQL, as a single statement, over the alternative of ranking in the application (reading every due job into memory, computing turns, then claiming): it keeps `FOR UPDATE SKIP LOCKED` doing what it already does — claiming rows nobody else has touched — atomically with the fairness computation, and it never brings a due-but-unclaimed row into the Node process just to decide its position. The window function does still have to scan every currently *due, unclaimed* row to compute `row_number()` correctly (fairness cannot be computed without comparing a tenant's backlog to everyone else's), but that set is bounded by the backlog, not by history: completed and exhausted jobs are excluded by the same partial predicate the old index used, so the table's full row count never enters the calculation.

A new index makes that scan cheap: `jobs_dispatch_idx` on `(tenant_id, priority, run_at, id) WHERE completed_at IS NULL AND exhausted_at IS NULL`, replacing the old `jobs_due_idx` on `(run_at, id)`. Its column order matches the `PARTITION BY ... ORDER BY ...` clause exactly, so Postgres can feed the window function from an index scan already in the right order, without a separate sort step; the registry-scoped call (no tenant filter, used by both the worker and the cron route) still benefits, because the index is ordered by `tenant_id` first, which is exactly the partition key. `packages/infrastructure/migrations/0007_fair_job_dispatch.sql` carries the migration; it was generated with `bun run db:generate` against the updated Drizzle schema and hand-extended with a `CHECK (priority IN (0, 1))` constraint, following the same pattern earlier migrations use for hand-written additions to a generated file.

The in-memory `JobQueue` (`packages/infrastructure/src/memory/job-queue.ts`) computes the identical two-pass ranking in JavaScript (sort into partitions, assign a turn per partition, re-sort by priority then turn), so a memory-backed test and a Postgres-backed test are asserting the same contract, not two different behaviours that happen to agree today. `packages/infrastructure/test/contracts/job-queue.contract.ts` (run against both, per `docs/layers/infrastructure.md`) now has tests that a busy tenant and a quiet tenant both appear in the very first batch, and that giving every tenant a turn precedes giving any tenant a second job — the two claims decision 0015 could not have anticipated because it predates a second caller ever contending for the same batch.

### 3. Priority lanes, without letting priority buy a tenant's turn

`JobPriority` (`packages/application/src/kernel/ports/job-queue.ts`) is two levels: `"interactive"` (a job with someone waiting on the other end) and `"background"` (everything else, and the default — every job enqueued before this change keeps its exact behaviour, since it is implicitly `"background"` and there was only one lane). `EnqueueJobRequest.priority` is optional for the same reason decision 0015 shipped the queue without a producer: no use case in this wave needs `"interactive"`, so none was invented to use it; the capability is there for the first one that does.

Priority is the outer sort key, turn the inner one: `ORDER BY priority ASC, turn ASC, run_at ASC, id ASC`. This means every tenant's interactive backlog is fully claimed, fairly round-robined among the tenants that have any, before a single background job from anyone is claimed — a job with a person waiting genuinely should not sit behind last night's report. But `turn` is computed `PARTITION BY tenant_id, priority`, never just `priority`: two tenants both flooding the interactive lane still take turns with each other inside that lane, on the same terms as the background lane. Priority changes *which lane goes first*, never *whose turn it is within a lane* — a tenant cannot use priority to cut in front of another tenant, only to move its own work ahead of its own, and ahead of every other tenant's lower-priority work as a class. That distinction is exactly what the brief asked for, and it is why priority and the fairness fix share one `ORDER BY` clause instead of being two independent mechanisms bolted together.

### 4. The three triggers

| Trigger | Where | Ceiling | When to use it |
| --- | --- | --- | --- |
| Vercel Cron | `apps/web/vercel.json` → `/api/cron/dispatch` | Hobby: at most once a day, and Hobby is licensed for non-commercial use only, so it is not a real option for production. Pro: at most once a minute. | Production on Vercel Pro. |
| GitHub Actions | `.github/workflows/cron-dispatch.yml` → same route | Scheduled workflows on GitHub run at most every 5 minutes, and **GitHub disables a scheduled workflow automatically once the repository has gone 60 days without any activity** — it must be manually re-enabled (or the repo kept active) for a demo left running unattended. | The free-tier demo: decades of concurrent users, no billing, so Hobby's cron and its non-commercial restriction are both out. |
| `apps/worker` as a long-lived process | `apps/worker/src/index.ts`, unchanged | Bounded only by the container or VM it runs on: no cron interval, no function duration limit, continuous polling with backoff. | Real throughput, whenever a container (or any place that can run a long-lived process) is available. |

`apps/web/vercel.json`, not a repository-root `vercel.json`, is where the cron entry lives, because `README.md`'s own **Root Directory: `apps/web`** setting makes `apps/web` the effective project root Vercel reads configuration from; a file at the repository root would be silently ignored by this project's actual deployment. `README.md`'s "no root `vercel.json`" paragraph is rewritten to explain this rather than assert that none is needed — one now exists, just not at the repository root the note used to talk about.

## Consequences

- The worker's code changed only to the extent of exposing what it already privately built (`workerActor`, its dispatch wiring) a second time, for `apps/web`'s own container; no behavioural change to `apps/worker` itself.
- Every derived project gets the choice of trigger for free: activate the Vercel Cron entry, the GitHub Actions workflow, both (the SKIP LOCKED guarantee makes running both harmless, just occasionally redundant), or run `apps/worker` and remove the HTTP route's schedule, without touching `packages/application`.
- `claimDue`'s new query costs a window function over the due backlog on every call, where the old one was a plain indexed scan; this is the deliberate trade for fairness and was not benchmarked against extreme backlog sizes (tens of millions of simultaneously due rows) — should that ever happen, the next step is capping how many distinct tenants' turns are considered per call, not re-litigating this decision.
- Left undone: no `"interactive"` job producer exists yet, matching decision 0015's own choice not to invent a first consumer; no dashboard or alert watches `hasMoreWork` staying true across ticks, which would be the first sign a queue is falling behind its trigger's ceiling; the GitHub Actions workflow's own inactivity risk is documented, not mitigated, since keeping a demo repository active is a process decision, not a code one.
