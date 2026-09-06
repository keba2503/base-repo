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

  test("does not mistake a URL after a template substitution for a comment", () => {
    const issues = checkSource(
      "packages/domain/src/example.ts",
      "const a = `${1}/x`;\nconst b = `http://x`;\n",
    );
    expect(issues).toEqual([]);
  });

  test("does not mistake a regex literal containing // for a comment", () => {
    const issues = checkSource("packages/domain/src/example.ts", "const a = /^\\s*\\/\\//gm;\nconst b = 1;\n");
    expect(issues).toEqual([]);
  });

  test("still flags a real comment after a regex literal", () => {
    const issues = checkSource("packages/domain/src/example.ts", "const a = /x/g;\n// not allowed\n");
    expect(issues.some((issue) => issue.rule === "no-comments")).toBe(true);
  });

  test("treats a slash after an identifier as division, not a regex", () => {
    const issues = checkSource("packages/domain/src/example.ts", "const a = 10;\nconst b = a / 2;\n");
    expect(issues).toEqual([]);
  });

  test("still flags a real comment after a template substitution", () => {
    const issues = checkSource(
      "packages/domain/src/example.ts",
      "const a = `${1}/x`;\n// not allowed\n",
    );
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

  test("flags a raw button under apps/web/src/app", () => {
    const issues = checkSource(
      "apps/web/src/app/tenants/new/tenant-form.tsx",
      "export function Form() { return <button type=\"submit\">Send</button>; }\n",
    );
    expect(issues.some((issue) => issue.rule === "reuse-ui-primitives")).toBe(true);
  });

  test("flags a raw self closing input under apps/web/src/app", () => {
    const issues = checkSource(
      "apps/web/src/app/tenants/new/tenant-form.tsx",
      'export function Form() { return <input type="text" />; }\n',
    );
    expect(issues.some((issue) => issue.rule === "reuse-ui-primitives")).toBe(true);
  });

  test("allows a raw button inside apps/web/src/ui", () => {
    const issues = checkSource(
      "apps/web/src/ui/button.tsx",
      "export function Button(props) { return <button {...props} />; }\n",
    );
    expect(issues.some((issue) => issue.rule === "reuse-ui-primitives")).toBe(false);
  });

  test("allows the Button component from @/ui", () => {
    const issues = checkSource(
      "apps/web/src/app/tenants/new/tenant-form.tsx",
      "export function Form() { return <Button type=\"submit\">Send</Button>; }\n",
    );
    expect(issues.some((issue) => issue.rule === "reuse-ui-primitives")).toBe(false);
  });

  test("flags a raw element in a shared layout", () => {
    const issues = checkSource(
      "apps/web/src/layouts/list-page.tsx",
      'export function ListPage() { return <button type="button">x</button>; }\n',
    );
    expect(issues.some((issue) => issue.rule === "reuse-ui-primitives")).toBe(true);
  });

  test("does not flag raw elements outside apps/web/src", () => {
    const issues = checkSource(
      "packages/adapters/src/tenants/example.tsx",
      'export function Example() { return <button type="button">x</button>; }\n',
    );
    expect(issues.some((issue) => issue.rule === "reuse-ui-primitives")).toBe(false);
  });
});
