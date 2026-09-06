import { describe, expect, it } from "bun:test";
import {
  compareEnvExample,
  declaredVariablesFrom,
  documentedEnvVariables,
  envFilePattern,
} from "./check-env-example";

describe("declaredVariablesFrom", () => {
  it("reads every variable name out of the moduleEnvVariables groups", () => {
    const source = `
      const moduleEnvVariables = {
        persistence: [
          ["databaseUrl", "DATABASE_URL"],
          ["resendApiKey", "RESEND_API_KEY"],
        ],
      } as const;
    `;
    expect(declaredVariablesFrom("apps/web/src/main/env.ts", source).map((entry) => entry.variable)).toEqual([
      "DATABASE_URL",
      "RESEND_API_KEY",
    ]);
  });

  it("reads variables from every module group, not just the first", () => {
    const source = `
      const moduleEnvVariables = {
        identity: [["supabaseUrl", "SUPABASE_URL"]],
        documents: [["supabaseServiceRoleKey", "SUPABASE_SERVICE_ROLE_KEY"]],
      } as const;
    `;
    expect(declaredVariablesFrom("apps/web/src/main/env.ts", source).map((entry) => entry.variable)).toEqual([
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  it("does not depend on the order the tuples are written in", () => {
    const reordered = `
      const moduleEnvVariables = {
        persistence: [
          ["resendApiKey", "RESEND_API_KEY"],
          ["databaseUrl", "DATABASE_URL"],
        ],
      } as const;
    `;
    expect(declaredVariablesFrom("apps/web/src/main/env.ts", reordered).map((entry) => entry.variable)).toEqual([
      "RESEND_API_KEY",
      "DATABASE_URL",
    ]);
  });

  it("survives reformatting onto a single line", () => {
    const oneLine = `const moduleEnvVariables = { persistence: [["databaseUrl", "DATABASE_URL"]] } as const;`;
    expect(declaredVariablesFrom("apps/web/src/main/env.ts", oneLine).map((entry) => entry.variable)).toEqual([
      "DATABASE_URL",
    ]);
  });

  it("finds nothing when there is no moduleEnvVariables declaration", () => {
    expect(declaredVariablesFrom("apps/web/src/main/env.ts", "export const env = {};")).toEqual([]);
  });

  it("tags every entry with the file it came from", () => {
    const source = `const moduleEnvVariables = { persistence: [["databaseUrl", "DATABASE_URL"]] } as const;`;
    expect(declaredVariablesFrom("apps/worker/src/main/env.ts", source)).toEqual([
      { file: "apps/worker/src/main/env.ts", variable: "DATABASE_URL" },
    ]);
  });
});

describe("documentedEnvVariables", () => {
  it("reads every key declared before its equals sign", () => {
    expect([...documentedEnvVariables("DATABASE_URL=\nAPI_KEY_PEPPER=\n")]).toEqual([
      "DATABASE_URL",
      "API_KEY_PEPPER",
    ]);
  });

  it("ignores blank lines and comments", () => {
    expect([...documentedEnvVariables("\n# a comment\nDATABASE_URL=\n")]).toEqual(["DATABASE_URL"]);
  });
});

describe("compareEnvExample", () => {
  it("reports a variable declared by a module but absent from the example file", () => {
    const declared = [{ file: "apps/web/src/main/env.ts", variable: "FIELD_ENCRYPTION_KEYS" }];
    expect(compareEnvExample(declared, new Set(["DATABASE_URL"]))).toEqual(declared);
  });

  it("passes once every declared variable is documented", () => {
    const declared = [{ file: "apps/web/src/main/env.ts", variable: "DATABASE_URL" }];
    expect(compareEnvExample(declared, new Set(["DATABASE_URL", "SUPABASE_TEST_EMAIL"]))).toEqual([]);
  });
});

describe("envFilePattern", () => {
  it("matches an env.ts under any app's main directory", () => {
    expect(envFilePattern.test("apps/web/src/main/env.ts")).toBe(true);
    expect(envFilePattern.test("apps/worker/src/main/env.ts")).toBe(true);
  });

  it("ignores an env.ts anywhere else", () => {
    expect(envFilePattern.test("packages/infrastructure/src/main/env.ts")).toBe(false);
    expect(envFilePattern.test("apps/web/src/main/nested/env.ts")).toBe(false);
  });
});
