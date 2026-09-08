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
  readonly condition: string | undefined;
};

const jobHeading = /^ {2}([A-Za-z0-9_-]+):\s*$/;
const jobCondition = /^ {4}if:\s*(.*)$/m;
const secretReference = /secrets\.[A-Za-z0-9_]+/;
const decidingReference = /vars\.[A-Za-z0-9_]+|github\.event/;
const scheduleEntry = /^ {4}- cron:\s*["']([^"']+)["']\s*$/;
const scheduleComparison = /github\.event\.schedule\s*==\s*["']([^"']+)["']/g;

export function schedulesOf(content: string): string[] {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => /^ {2}schedule:\s*$/.test(line));
  if (start === -1) return [];

  const schedules: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const entry = scheduleEntry.exec(line);
    if (entry === null) break;
    schedules.push(entry[1]);
  }
  return schedules;
}

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

  const close = (): void => {
    if (name === undefined) return;
    const joined = body.join("\n");
    jobs.push({ name, body: joined, condition: jobCondition.exec(joined)?.[1]?.trim() });
  };

  for (const line of lines.slice(start + 1)) {
    if (line.length > 0 && !line.startsWith(" ")) break;
    const heading = jobHeading.exec(line);
    if (heading === null) {
      if (name !== undefined) body.push(line);
      continue;
    }
    close();
    name = heading[1];
    body = [];
  }
  close();

  return jobs;
}

export function sharesASecret(content: string): boolean {
  const start = content.split("\n").findIndex((line) => /^jobs:\s*$/.test(line));
  if (start === -1) return false;
  return secretReference.test(content.split("\n").slice(0, start).join("\n"));
}

export function checkWorkflows(files: readonly WorkflowFile[]): WorkflowFailure[] {
  const failures: WorkflowFailure[] = [];

  for (const file of files) {
    if (!runsOnASchedule(file.content)) continue;
    const schedules = schedulesOf(file.content);
    const inherited = sharesASecret(file.content);

    for (const job of jobsOf(file.content)) {
      for (const comparison of job.condition?.matchAll(scheduleComparison) ?? []) {
        if (schedules.includes(comparison[1])) continue;
        failures.push({
          path: file.path,
          job: job.name,
          reason: `se compara con el horario ${comparison[1]}, que no está entre los que disparan este workflow, así que nunca se ejecuta`,
        });
      }

      if (!inherited && !secretReference.test(job.body)) continue;

      if (job.condition === undefined) {
        failures.push({
          path: file.path,
          job: job.name,
          reason:
            "corre en cada tick programado y necesita un secreto, sin ninguna condición que lo desmonte donde ese secreto no está configurado",
        });
        continue;
      }

      if (!decidingReference.test(job.condition)) {
        failures.push({
          path: file.path,
          job: job.name,
          reason: `necesita un secreto y su condición, ${job.condition}, no mira ninguna variable del repositorio ni el evento que lo dispara, así que no desmonta nada`,
        });
      }
    }
  }

  return failures;
}
