import { derive, partialRunAdvice, reportOf, trackedFiles } from "./derive";

const [scope, repositoryName] = process.argv.slice(2);

if (scope === undefined || repositoryName === undefined) {
  console.error("usage: bun run derive <scope> <repo-name>");
  process.exit(1);
}

const root = process.cwd();

try {
  console.log(reportOf(derive({ root, scope, repositoryName, files: trackedFiles(root) })));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(partialRunAdvice);
  process.exit(1);
}
