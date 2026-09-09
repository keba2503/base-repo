import { describe, expect, test } from "bun:test";
import { checkBytes, checkSource, hasCheckedSyntax } from "./check-source";
import { decodedText } from "../utf8";

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

  test("flags a raw NUL byte written into a template literal", () => {
    const issues = checkSource(
      "packages/infrastructure/src/memory/rate-limiter.ts",
      "const slot = `${a}" + "\u0000" + "${b}`;\n",
    );
    expect(issues.some((issue) => issue.rule === "no-control-bytes")).toBe(true);
  });

  test("names the code point of the raw control byte it found", () => {
    const issues = checkSource("docs/notes.md", "a" + "\u001B" + "[31m\n");
    const control = issues.find((issue) => issue.rule === "no-control-bytes");
    expect(control?.message).toContain("U+001B");
  });

  test("flags a raw control byte in a file the other rules ignore", () => {
    const issues = checkSource("architecture/modules.json", "{\"a\": \"" + "\u0007" + "\"}\n");
    expect(issues.some((issue) => issue.rule === "no-control-bytes")).toBe(true);
  });

  test("accepts tab, newline and carriage return", () => {
    const issues = checkSource("packages/domain/src/example.ts", "const a = 1;\t\r\nconst b = 2;\n");
    expect(issues.some((issue) => issue.rule === "no-control-bytes")).toBe(false);
  });

  test("accepts the escaped form of the same separator", () => {
    const issues = checkSource(
      "packages/infrastructure/src/memory/rate-limiter.ts",
      "const slot = `${a}\\u0000${b}`;\n",
    );
    expect(issues).toEqual([]);
  });
});

describe("decodedText", () => {
  test("decodes a text file, control byte included", () => {
    expect(decodedText(new Uint8Array([104, 105, 0]))).toBe("hi" + "\u0000");
  });

  test("refuses bytes that are not valid utf-8, so text and data can be told apart", () => {
    expect(decodedText(new Uint8Array([0, 0, 1, 0, 0xff, 0xfe, 0x80]))).toBeUndefined();
  });
});

describe("checkBytes", () => {
  function bytesOf(text: string, stray: readonly number[] = []): Uint8Array {
    return new Uint8Array([...new TextEncoder().encode(text), ...stray]);
  }

  test("refuses a source file that is not valid utf-8 instead of skipping every rule on it", () => {
    const smuggled = "function f(x: any) { return process.env.SECRET; }\n";
    const issues = checkBytes("packages/domain/src/example.ts", bytesOf(smuggled, [0x80]));
    expect(issues.map((issue) => issue.rule)).toEqual(["invalid-utf8"]);
  });

  test("still applies every rule to a source file that decodes", () => {
    const smuggled = "function f(x: any) { return process.env.SECRET; }\n";
    const rules = checkBytes("packages/domain/src/example.ts", bytesOf(smuggled)).map((issue) => issue.rule);
    expect(rules).toContain("no-any");
    expect(rules).toContain("env-only-in-main");
  });

  test("refuses a markup or configuration file that is not valid utf-8", () => {
    expect(checkBytes("docs/notes.md", bytesOf("hi", [0xff])).map((i) => i.rule)).toEqual(["invalid-utf8"]);
    expect(checkBytes("architecture/layers.json", bytesOf("{}", [0xff])).map((i) => i.rule)).toEqual(["invalid-utf8"]);
    expect(checkBytes(".github/workflows/ci.yml", bytesOf("on:", [0xff])).map((i) => i.rule)).toEqual(["invalid-utf8"]);
  });

  test("skips a file no rule reads, so an icon is not a violation", () => {
    expect(checkBytes("apps/web/src/app/favicon.ico", bytesOf("", [0, 0, 1, 0, 0xff, 0xfe, 0x80]))).toEqual([]);
  });

  test("catches the raw control byte through the byte entry point too", () => {
    const issues = checkBytes("packages/domain/src/example.ts", bytesOf("const a = 1;", [0]));
    expect(issues.some((issue) => issue.rule === "no-control-bytes")).toBe(true);
  });
});

describe("hasCheckedSyntax", () => {
  test("names the files whose syntax some rule reads", () => {
    expect(hasCheckedSyntax("packages/domain/src/a.ts")).toBe(true);
    expect(hasCheckedSyntax("apps/web/src/app/page.tsx")).toBe(true);
    expect(hasCheckedSyntax("docs/a.md")).toBe(true);
    expect(hasCheckedSyntax("package.json")).toBe(true);
    expect(hasCheckedSyntax(".github/workflows/ci.yml")).toBe(true);
    expect(hasCheckedSyntax(".gitignore")).toBe(true);
    expect(hasCheckedSyntax("apps/web/src/app/favicon.ico")).toBe(false);
    expect(hasCheckedSyntax("bun.lock")).toBe(false);
  });
});
