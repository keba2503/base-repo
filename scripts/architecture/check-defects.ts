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
    } else if (!gate.startsWith("scripts/")) {
      failures.push({ path, reason: `gate ${gate} no vive bajo scripts/` });
    } else if (!trackedFiles.has(gate)) {
      failures.push({ path, reason: `gate ${gate} no existe entre los scripts del repositorio` });
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
): readonly DefectFailure[] {
  const trackedSet = new Set(trackedFiles);
  const failures: DefectFailure[] = [];
  const idsSeen = new Map<string, string>();

  for (const file of files) {
    failures.push(...checkDefectFile(file.path, file.content, trackedSet));

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
