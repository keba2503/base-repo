import { describe, expect, it } from "bun:test";
import { checkWorkflows, jobsOf, runsOnASchedule } from "./check-workflows";

const scheduled = `name: Cron dispatch

on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Drain
        env:
          CRON_SECRET: \${{ secrets.CRON_SECRET }}
        run: echo drained
`;

const guarded = scheduled.replace(
  "  dispatch:\n    runs-on",
  "  dispatch:\n    if: vars.CRON_DISPATCH_ENABLED == 'true'\n    runs-on",
);

const onPullRequests = `name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - env:
          TOKEN: \${{ secrets.TOKEN }}
        run: bun run check
`;

const scheduledWithoutSecrets = `name: CodeQL

on:
  schedule:
    - cron: "0 3 * * 1"

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - run: echo analyzed
`;

describe("runsOnASchedule", () => {
  it("sees a schedule entry inside the trigger block", () => {
    expect(runsOnASchedule(scheduled)).toBe(true);
  });

  it("does not confuse a job step named schedule with a trigger", () => {
    expect(runsOnASchedule(onPullRequests)).toBe(false);
  });
});

describe("jobsOf", () => {
  it("reads every job with its own body", () => {
    expect(jobsOf(scheduled).map((job) => job.name)).toEqual(["dispatch"]);
    expect(jobsOf(scheduled)[0]?.body).toContain("secrets.CRON_SECRET");
  });
});

describe("checkWorkflows", () => {
  it("rejects a scheduled job that needs a secret and runs unconditionally", () => {
    expect(checkWorkflows([{ path: ".github/workflows/cron-dispatch.yml", content: scheduled }])).toEqual([
      {
        path: ".github/workflows/cron-dispatch.yml",
        job: "dispatch",
        reason:
          "corre en cada tick programado y necesita un secreto, sin ninguna condición que lo desmonte donde ese secreto no está configurado",
      },
    ]);
  });

  it("accepts the same job once a condition decides whether it is mounted", () => {
    expect(checkWorkflows([{ path: ".github/workflows/cron-dispatch.yml", content: guarded }])).toEqual([]);
  });

  it("leaves a workflow that no schedule triggers alone", () => {
    expect(checkWorkflows([{ path: ".github/workflows/ci.yml", content: onPullRequests }])).toEqual([]);
  });

  it("leaves a scheduled workflow that needs no secret alone", () => {
    expect(checkWorkflows([{ path: ".github/workflows/codeql.yml", content: scheduledWithoutSecrets }])).toEqual([]);
  });
});
