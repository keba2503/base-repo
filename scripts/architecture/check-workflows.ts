export const workflowDirectory = ".github/workflows";

export type WorkflowFile = {
  readonly path: string;
  readonly content: string;
};

export type WorkflowFailure = {
  readonly path: string;
  readonly job: string;
  readonly reason: string;
};

type Job = {
  readonly name: string;
  readonly body: string;
};

const jobHeading = /^ {2}([A-Za-z0-9_-]+):\s*$/;
const jobCondition = /^ {4}if:/m;
const secretReference = /secrets\.[A-Za-z0-9_]+/;

export function runsOnASchedule(content: string): boolean {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (start === -1) return /^on:.*schedule/.test(content);

  for (const line of lines.slice(start + 1)) {
    if (line.length > 0 && !line.startsWith(" ")) return false;
    if (/^ {2}schedule:\s*$/.test(line)) return true;
  }
  return false;
}

export function jobsOf(content: string): Job[] {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (start === -1) return [];

  const jobs: Job[] = [];
  let name: string | undefined;
  let body: string[] = [];

  for (const line of lines.slice(start + 1)) {
    if (line.length > 0 && !line.startsWith(" ")) break;
    const heading = jobHeading.exec(line);
    if (heading === null) {
      if (name !== undefined) body.push(line);
      continue;
    }
    if (name !== undefined) jobs.push({ name, body: body.join("\n") });
    name = heading[1];
    body = [];
  }
  if (name !== undefined) jobs.push({ name, body: body.join("\n") });

  return jobs;
}

export function checkWorkflows(files: readonly WorkflowFile[]): WorkflowFailure[] {
  const failures: WorkflowFailure[] = [];

  for (const file of files) {
    if (!runsOnASchedule(file.content)) continue;
    for (const job of jobsOf(file.content)) {
      if (!secretReference.test(job.body)) continue;
      if (jobCondition.test(job.body)) continue;
      failures.push({
        path: file.path,
        job: job.name,
        reason:
          "corre en cada tick programado y necesita un secreto, sin ninguna condición que lo desmonte donde ese secreto no está configurado",
      });
    }
  }

  return failures;
}
