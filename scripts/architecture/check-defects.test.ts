import { describe, expect, it } from "bun:test";
import { checkDefectRegistry, parseFrontmatter } from "./check-defects";

function defect(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n\n# Body\n`;
}

const trackedFiles = [
  "scripts/architecture/check-env-completeness.ts",
  "packages/application/test/dispatch-jobs.test.ts",
  ".github/workflows/ci.yml",
];

describe("parseFrontmatter", () => {
  it("reads key value pairs between the opening and closing markers", () => {
    expect(parseFrontmatter(defect("id: DEF-0001\ndate: 2026-09-06"))).toEqual({
      id: "DEF-0001",
      date: "2026-09-06",
    });
  });

  it("finds nothing when the file does not open with a marker", () => {
    expect(parseFrontmatter("# Body\n")).toBeUndefined();
  });
});

describe("checkDefectRegistry", () => {
  it("passes a defect prevented by a gate that exists on disk", () => {
    const content = defect(
      [
        "id: DEF-0001",
        "date: 2026-09-06",
        "found_in: revisión de seguridad",
        "prevented_by: gate",
        "gate: scripts/architecture/check-env-completeness.ts",
      ].join("\n"),
    );
    expect(checkDefectRegistry([{ path: "docs/defects/DEF-0001-x.md", content }], trackedFiles)).toEqual([]);
  });

  it("passes a defect prevented by a gate that lives in a CI workflow", () => {
    const content = defect(
      [
        "id: DEF-0016",
        "date: 2026-09-06",
        "found_in: revisión de la suite de Postgres",
        "prevented_by: gate",
        "gate: .github/workflows/ci.yml",
      ].join("\n"),
    );
    expect(checkDefectRegistry([{ path: "docs/defects/DEF-0016-x.md", content }], trackedFiles)).toEqual([]);
  });

  it("passes a defect prevented by a test that exists on disk", () => {
    const content = defect(
      [
        "id: DEF-0002",
        "date: 2026-09-06",
        "found_in: revisión de despliegue progresivo",
        "prevented_by: test",
        "test: packages/application/test/dispatch-jobs.test.ts",
      ].join("\n"),
    );
    expect(checkDefectRegistry([{ path: "docs/defects/DEF-0002-x.md", content }], trackedFiles)).toEqual([]);
  });

  it("passes a defect that admits it cannot be measured, with a reason", () => {
    const content = defect(
      [
        "id: DEF-0003",
        "date: 2026-09-06",
        "found_in: revisión previa al despliegue",
        "prevented_by: none",
        "reason: depende de un límite de la plataforma de hosting, no del código de este repositorio",
      ].join("\n"),
    );
    expect(checkDefectRegistry([{ path: "docs/defects/DEF-0003-x.md", content }], trackedFiles)).toEqual([]);
  });

  it("rejects a file with no frontmatter at all", () => {
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-0004-x.md", content: "# Body\n" }], trackedFiles);
    expect(failures).toEqual([
      { path: "docs/defects/DEF-0004-x.md", reason: "no lleva metadatos --- al principio del fichero" },
    ]);
  });

  it("rejects a missing prevented_by", () => {
    const content = defect(["id: DEF-0005", "date: 2026-09-06", "found_in: x"].join("\n"));
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-0005-x.md", content }], trackedFiles);
    expect(failures).toEqual([
      { path: "docs/defects/DEF-0005-x.md", reason: "prevented_by ausente o distinto de gate, test o none" },
    ]);
  });

  it("rejects a prevented_by value outside the three admitted answers", () => {
    const content = defect(
      ["id: DEF-0006", "date: 2026-09-06", "found_in: x", "prevented_by: process-change"].join("\n"),
    );
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-0006-x.md", content }], trackedFiles);
    expect(failures).toEqual([
      { path: "docs/defects/DEF-0006-x.md", reason: "prevented_by ausente o distinto de gate, test o none" },
    ]);
  });

  it("rejects a test defect naming a file that does not exist on disk", () => {
    const content = defect(
      [
        "id: DEF-0007",
        "date: 2026-09-06",
        "found_in: x",
        "prevented_by: test",
        "test: packages/application/test/does-not-exist.test.ts",
      ].join("\n"),
    );
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-0007-x.md", content }], trackedFiles);
    expect(failures).toEqual([
      {
        path: "docs/defects/DEF-0007-x.md",
        reason: "test packages/application/test/does-not-exist.test.ts no existe en el disco",
      },
    ]);
  });

  it("rejects a gate defect naming a script that does not exist among the repository's scripts", () => {
    const content = defect(
      [
        "id: DEF-0008",
        "date: 2026-09-06",
        "found_in: x",
        "prevented_by: gate",
        "gate: scripts/architecture/does-not-exist.ts",
      ].join("\n"),
    );
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-0008-x.md", content }], trackedFiles);
    expect(failures).toEqual([
      {
        path: "docs/defects/DEF-0008-x.md",
        reason: "gate scripts/architecture/does-not-exist.ts no existe entre los scripts o los workflows del repositorio",
      },
    ]);
  });

  it("rejects a gate that does not live under scripts/ or .github/workflows/", () => {
    const content = defect(
      ["id: DEF-0009", "date: 2026-09-06", "found_in: x", "prevented_by: gate", "gate: package.json"].join("\n"),
    );
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-0009-x.md", content }], trackedFiles);
    expect(failures).toEqual([
      { path: "docs/defects/DEF-0009-x.md", reason: "gate package.json no vive bajo scripts/ ni bajo .github/workflows/" },
    ]);
  });

  it("rejects prevented_by none with no reason written", () => {
    const content = defect(["id: DEF-0010", "date: 2026-09-06", "found_in: x", "prevented_by: none"].join("\n"));
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-0010-x.md", content }], trackedFiles);
    expect(failures).toEqual([
      { path: "docs/defects/DEF-0010-x.md", reason: "prevented_by es none pero falta el campo reason" },
    ]);
  });

  it("rejects an id that does not match the DEF-NNNN shape", () => {
    const content = defect(
      ["id: DEF-1", "date: 2026-09-06", "found_in: x", "prevented_by: none", "reason: x"].join("\n"),
    );
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-1-x.md", content }], trackedFiles);
    expect(failures).toEqual([{ path: "docs/defects/DEF-1-x.md", reason: "id ausente o con forma distinta a DEF-NNNN" }]);
  });

  it("rejects an id that does not match the file name", () => {
    const content = defect(
      ["id: DEF-0011", "date: 2026-09-06", "found_in: x", "prevented_by: none", "reason: x"].join("\n"),
    );
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-0012-x.md", content }], trackedFiles);
    expect(failures).toEqual([
      { path: "docs/defects/DEF-0012-x.md", reason: "el nombre del fichero no empieza por su id DEF-0011" },
    ]);
  });

  it("rejects a date with the wrong shape", () => {
    const content = defect(
      ["id: DEF-0013", "date: 06/09/2026", "found_in: x", "prevented_by: none", "reason: x"].join("\n"),
    );
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-0013-x.md", content }], trackedFiles);
    expect(failures).toEqual([
      { path: "docs/defects/DEF-0013-x.md", reason: "date ausente o con forma distinta a AAAA-MM-DD" },
    ]);
  });

  it("rejects a defect with no found_in", () => {
    const content = defect(["id: DEF-0014", "date: 2026-09-06", "prevented_by: none", "reason: x"].join("\n"));
    const failures = checkDefectRegistry([{ path: "docs/defects/DEF-0014-x.md", content }], trackedFiles);
    expect(failures).toEqual([{ path: "docs/defects/DEF-0014-x.md", reason: "found_in ausente o vacío" }]);
  });

  it("rejects two defects reusing the same id", () => {
    const content = defect(
      ["id: DEF-0015", "date: 2026-09-06", "found_in: x", "prevented_by: none", "reason: x"].join("\n"),
    );
    const failures = checkDefectRegistry(
      [
        { path: "docs/defects/DEF-0015-a.md", content },
        { path: "docs/defects/DEF-0015-b.md", content },
      ],
      trackedFiles,
    );
    expect(failures).toEqual([
      { path: "docs/defects/DEF-0015-b.md", reason: "id DEF-0015 repetido, ya usado por docs/defects/DEF-0015-a.md" },
    ]);
  });
});
