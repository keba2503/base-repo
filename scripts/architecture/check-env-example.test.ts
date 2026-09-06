import { describe, expect, it } from "bun:test";
import {
  compareEnvExample,
  documentedEnvVariables,
  envFilePattern,
  requiredVariablesFrom,
} from "./check-env-example";

describe("requiredVariablesFrom", () => {
  it("reads every variable name out of the requiredInProduction tuples", () => {
    const source = `
      const requiredInProduction = [
        ["databaseUrl", "DATABASE_URL"],
        ["resendApiKey", "RESEND_API_KEY"],
      ] as const;
    `;
    expect(requiredVariablesFrom("apps/web/src/main/env.ts", source).map((entry) => entry.variable)).toEqual([
      "DATABASE_URL",
      "RESEND_API_KEY",
    ]);
  });

  it("does not depend on the order the tuples are written in", () => {
    const reordered = `
      const requiredInProduction = [
        ["resendApiKey", "RESEND_API_KEY"],
        ["databaseUrl", "DATABASE_URL"],
      ] as const;
    `;
    expect(requiredVariablesFrom("apps/web/src/main/env.ts", reordered).map((entry) => entry.variable)).toEqual([
      "RESEND_API_KEY",
      "DATABASE_URL",
    ]);
  });

  it("survives reformatting onto a single line", () => {
    const oneLine = `const requiredInProduction = [["databaseUrl", "DATABASE_URL"]] as const;`;
    expect(requiredVariablesFrom("apps/web/src/main/env.ts", oneLine).map((entry) => entry.variable)).toEqual([
      "DATABASE_URL",
    ]);
  });

  it("finds nothing when there is no requiredInProduction list", () => {
    expect(requiredVariablesFrom("apps/web/src/main/env.ts", "export const env = {};")).toEqual([]);
  });

  it("tags every entry with the file it came from", () => {
    const source = `const requiredInProduction = [["databaseUrl", "DATABASE_URL"]] as const;`;
    expect(requiredVariablesFrom("apps/worker/src/main/env.ts", source)).toEqual([
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
  it("reports a variable required in production but absent from the example file", () => {
    const required = [{ file: "apps/web/src/main/env.ts", variable: "FIELD_ENCRYPTION_KEYS" }];
    expect(compareEnvExample(required, new Set(["DATABASE_URL"]))).toEqual(required);
  });

  it("passes once every required variable is documented", () => {
    const required = [{ file: "apps/web/src/main/env.ts", variable: "DATABASE_URL" }];
    expect(compareEnvExample(required, new Set(["DATABASE_URL", "SUPABASE_TEST_EMAIL"]))).toEqual([]);
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
