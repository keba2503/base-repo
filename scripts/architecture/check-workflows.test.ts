import { describe, expect, it } from "bun:test";
import { checkWorkflows, jobsOf, runsOnASchedule, schedulesOf, sharesASecret } from "./check-workflows";

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


const alwaysTrue = scheduled.replace(
  "  dispatch:\n    runs-on",
  "  dispatch:\n    if: always()\n    runs-on",
);

const twoSchedules = `name: Cron dispatch

on:
  schedule:
    - cron: "*/5 * * * *"
    - cron: "41 7 * * *"

jobs:
  dispatch:
    if: github.event.schedule == '*/5 * * * *' && vars.CRON_DISPATCH_ENABLED == 'true'
    runs-on: ubuntu-latest
    steps:
      - env:
          CRON_SECRET: \${{ secrets.CRON_SECRET }}
        run: echo drained
  configuration:
    if: github.event.schedule == '41 7 * * *'
    runs-on: ubuntu-latest
    steps:
      - env:
          CRON_SECRET: \${{ secrets.CRON_SECRET }}
        run: echo checked
`;

const driftedSchedule = twoSchedules.replace('- cron: "41 7 * * *"', '- cron: "41 8 * * *"');

describe("schedulesOf", () => {
  it("reads every cron entry that triggers the workflow", () => {
    expect(schedulesOf(twoSchedules)).toEqual(["*/5 * * * *", "41 7 * * *"]);
  });
});


const secretAboveTheJobs = `name: Cron dispatch

on:
  schedule:
    - cron: "*/5 * * * *"

env:
  CRON_SECRET: \${{ secrets.CRON_SECRET }}

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - run: echo drained
`;

describe("sharesASecret", () => {
  it("sees a secret every job inherits from above the jobs block", () => {
    expect(sharesASecret(secretAboveTheJobs)).toBe(true);
    expect(sharesASecret(scheduledWithoutSecrets)).toBe(false);
  });
});

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


  it("rejects a condition that decides nothing", () => {
    const failures = checkWorkflows([{ path: ".github/workflows/cron-dispatch.yml", content: alwaysTrue }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toContain("no desmonta nada");
  });

  it("accepts jobs split across the schedules that actually trigger the workflow", () => {
    expect(checkWorkflows([{ path: ".github/workflows/cron-dispatch.yml", content: twoSchedules }])).toEqual([]);
  });

  it("rejects a job waiting for a schedule the workflow no longer declares", () => {
    const failures = checkWorkflows([{ path: ".github/workflows/cron-dispatch.yml", content: driftedSchedule }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.job).toBe("configuration");
    expect(failures[0]?.reason).toContain("nunca se ejecuta");
  });


  it("rejects an unconditional job whose secret comes from the workflow, not from its own steps", () => {
    const failures = checkWorkflows([{ path: ".github/workflows/cron-dispatch.yml", content: secretAboveTheJobs }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.job).toBe("dispatch");
  });

  it("leaves a workflow that no schedule triggers alone", () => {
    expect(checkWorkflows([{ path: ".github/workflows/ci.yml", content: onPullRequests }])).toEqual([]);
  });

  it("leaves a scheduled workflow that needs no secret alone", () => {
    expect(checkWorkflows([{ path: ".github/workflows/codeql.yml", content: scheduledWithoutSecrets }])).toEqual([]);
  });
});
