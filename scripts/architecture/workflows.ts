import { readFileSync, readdirSync } from "node:fs";
import { checkWorkflows, workflowDirectory, type WorkflowFile } from "./check-workflows";

function workflowFiles(): WorkflowFile[] {
  return readdirSync(workflowDirectory)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => `${workflowDirectory}/${name}`)
    .map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

const failures = checkWorkflows(workflowFiles());

if (failures.length > 0) {
  console.error("Trabajos programados que fallarían en cualquier repositorio sin sus secretos:");
  for (const failure of failures) console.error(`  ${failure.path} (${failure.job}): ${failure.reason}`);
  process.exit(1);
}

console.log(`${workflowDirectory}: ningún trabajo programado depende de un secreto sin una condición que lo desmonte`);
