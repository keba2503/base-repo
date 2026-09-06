export const defectsDirectory = "docs/defects";

export const validPreventions = ["gate", "test", "none"] as const;
export type Prevention = (typeof validPreventions)[number];

export type DefectFile = {
  readonly path: string;
  readonly content: string;
};

export type DefectFailure = {
  readonly path: string;
  readonly reason: string;
};

export type DefectFrontmatter = Readonly<Record<string, string>>;

const gateDirectories = ["scripts/", ".github/workflows/"] as const;
const workflowDirectory = ".github/workflows/";

export function gateIsExecutable(gate: string): boolean {
  return gate.startsWith(workflowDirectory)
    ? gate.endsWith(".yml") || gate.endsWith(".yaml")
    : gate.endsWith(".ts");
}

export function directlyInvoked(sources: readonly DefectFile[]): string[] {
  const invoked = new Set<string>();
  for (const source of sources) {
    if (source.path.startsWith(workflowDirectory)) invoked.add(source.path);
    for (const match of source.content.matchAll(/scripts\/[A-Za-z0-9_./-]+\.ts/g)) invoked.add(match[0]);
  }
  return [...invoked];
}
const idPattern = /^DEF-\d{4}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseFrontmatter(content: string): DefectFrontmatter | undefined {
  const lines = content.split("\n");
  if (lines[0] !== "---") return undefined;
  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) return undefined;

  const frontmatter: Record<string, string> = {};
  for (const line of lines.slice(1, closingIndex)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key.length > 0) frontmatter[key] = value;
  }
  return frontmatter;
}

function checkDefectFile(
  path: string,
  content: string,
  trackedFiles: ReadonlySet<string>,
  invocations: ReadonlySet<string>,
): readonly DefectFailure[] {
  const frontmatter = parseFrontmatter(content);
  if (frontmatter === undefined) {
    return [{ path, reason: "no lleva metadatos --- al principio del fichero" }];
  }

  const failures: DefectFailure[] = [];

  const id = frontmatter.id;
  if (id === undefined || !idPattern.test(id)) {
    failures.push({ path, reason: "id ausente o con forma distinta a DEF-NNNN" });
  } else if (!(path.split("/").pop() ?? "").startsWith(id)) {
    failures.push({ path, reason: `el nombre del fichero no empieza por su id ${id}` });
  }

  const date = frontmatter.date;
  if (date === undefined || !datePattern.test(date)) {
    failures.push({ path, reason: "date ausente o con forma distinta a AAAA-MM-DD" });
  }

  const foundIn = frontmatter.found_in;
  if (foundIn === undefined || foundIn.length === 0) {
    failures.push({ path, reason: "found_in ausente o vacío" });
  }

  const preventedBy = frontmatter.prevented_by;
  if (preventedBy === undefined || !(validPreventions as readonly string[]).includes(preventedBy)) {
    failures.push({ path, reason: "prevented_by ausente o distinto de gate, test o none" });
    return failures;
  }

  if (preventedBy === "gate") {
    const gate = frontmatter.gate;
    if (gate === undefined || gate.length === 0) {
      failures.push({ path, reason: "prevented_by es gate pero falta el campo gate" });
    } else if (!gateDirectories.some((directory) => gate.startsWith(directory))) {
      failures.push({ path, reason: `gate ${gate} no vive bajo scripts/ ni bajo .github/workflows/` });
    } else if (!trackedFiles.has(gate)) {
      failures.push({ path, reason: `gate ${gate} no existe entre los scripts o los workflows del repositorio` });
    } else if (!gateIsExecutable(gate)) {
      failures.push({ path, reason: `gate ${gate} no es un script ejecutable ni un workflow` });
    } else if (!invocations.has(gate)) {
      failures.push({
        path,
        reason: `gate ${gate} existe pero nadie lo ejecuta: no aparece en los scripts de package.json ni en ningún workflow`,
      });
    }

    const regression = frontmatter.regression_test;
    if (regression === undefined || regression.length === 0) {
      failures.push({
        path,
        reason: "prevented_by es gate pero falta regression_test, el fichero que demuestra que la puerta atrapa este caso",
      });
    } else if (!regression.endsWith(".test.ts")) {
      failures.push({ path, reason: `regression_test ${regression} no es un fichero .test.ts` });
    } else if (!trackedFiles.has(regression)) {
      failures.push({ path, reason: `regression_test ${regression} no existe en el disco` });
    }
  }

  if (preventedBy === "test") {
    const test = frontmatter.test;
    if (test === undefined || test.length === 0) {
      failures.push({ path, reason: "prevented_by es test pero falta el campo test" });
    } else if (!test.endsWith(".test.ts")) {
      failures.push({ path, reason: `test ${test} no es un fichero .test.ts` });
    } else if (!trackedFiles.has(test)) {
      failures.push({ path, reason: `test ${test} no existe en el disco` });
    }
  }

  if (preventedBy === "none") {
    const reason = frontmatter.reason;
    if (reason === undefined || reason.length === 0) {
      failures.push({ path, reason: "prevented_by es none pero falta el campo reason" });
    }
  }

  return failures;
}

export function checkDefectRegistry(
  files: readonly DefectFile[],
  trackedFiles: readonly string[],
  invokedGates: readonly string[] = [],
): readonly DefectFailure[] {
  const trackedSet = new Set(trackedFiles);
  const invocations = new Set(invokedGates);
  const failures: DefectFailure[] = [];
  const idsSeen = new Map<string, string>();

  for (const file of files) {
    failures.push(...checkDefectFile(file.path, file.content, trackedSet, invocations));

    const id = parseFrontmatter(file.content)?.id;
    if (id === undefined) continue;
    const existing = idsSeen.get(id);
    if (existing === undefined) {
      idsSeen.set(id, file.path);
    } else {
      failures.push({ path: file.path, reason: `id ${id} repetido, ya usado por ${existing}` });
    }
  }

  return failures;
}
