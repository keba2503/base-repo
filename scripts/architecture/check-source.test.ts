import { describe, expect, test } from "bun:test";
import { checkSource } from "./check-source";

describe("checkSource", () => {
  test("flags line comments", () => {
    const issues = checkSource("packages/domain/src/example.ts", "const x = 1;\n// not allowed\n");
    expect(issues.some((issue) => issue.rule === "no-comments")).toBe(true);
  });

  test("flags block comments", () => {
    const issues = checkSource("packages/domain/src/example.ts", "/* not allowed */\nconst x = 1;\n");
    expect(issues.some((issue) => issue.rule === "no-comments")).toBe(true);
  });

  test("allows a shebang on the first line of a shell script", () => {
    const issues = checkSource("scripts/run.sh", "#!/usr/bin/env bash\necho hi\n");
    expect(issues).toEqual([]);
  });

  test("flags the any type", () => {
    const issues = checkSource("packages/domain/src/example.ts", "function f(x: any) { return x; }\n");
    expect(issues.some((issue) => issue.rule === "no-any")).toBe(true);
  });

  test("flags process.env outside of a main directory", () => {
    const issues = checkSource("apps/web/src/app/page.tsx", "const value = process.env.SOMETHING;\n");
    expect(issues.some((issue) => issue.rule === "env-only-in-main")).toBe(true);
  });

  test("allows process.env inside a main directory", () => {
    const issues = checkSource("apps/web/src/main/env.ts", "const value = process.env.SOMETHING;\n");
    expect(issues.some((issue) => issue.rule === "env-only-in-main")).toBe(false);
  });

  test("flags a domain module importing the application layer", () => {
    const issues = checkSource(
      "packages/domain/src/example.ts",
      'import { thing } from "@base/application";\n',
    );
    expect(issues.some((issue) => issue.rule === "dependency-rule")).toBe(true);
  });

  test("allows application importing domain", () => {
    const issues = checkSource(
      "packages/application/src/example.ts",
      'import { thing } from "@base/domain";\n',
    );
    expect(issues.some((issue) => issue.rule === "dependency-rule")).toBe(false);
  });
});
