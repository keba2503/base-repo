import { describe, expect, it } from "bun:test";
import { assertBillingPersistenceIsSafeInProduction } from "@/main/container";
import { env } from "@/main/env";

const productionEnvironment = { ...env, nodeEnv: "production" as const };
const developmentEnvironment = { ...env, nodeEnv: "development" as const };

describe("the billing persistence production guard", () => {
  it("throws when the billing module is active, the environment is production, and no database client is configured", () => {
    expect(() => assertBillingPersistenceIsSafeInProduction(productionEnvironment, true, false)).toThrow();
  });

  it("names DATABASE_URL and points at architecture/modules.json as the alternative", () => {
    let caught: unknown;
    try {
      assertBillingPersistenceIsSafeInProduction(productionEnvironment, true, false);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String((caught as Error).message)).toContain("DATABASE_URL");
    expect(String((caught as Error).message)).toContain("architecture/modules.json");
  });

  it("does not throw when a database client is configured", () => {
    expect(() => assertBillingPersistenceIsSafeInProduction(productionEnvironment, true, true)).not.toThrow();
  });

  it("does not throw when the billing module is inactive", () => {
    expect(() => assertBillingPersistenceIsSafeInProduction(productionEnvironment, false, false)).not.toThrow();
  });

  it("does not throw outside production even without a database client", () => {
    expect(() => assertBillingPersistenceIsSafeInProduction(developmentEnvironment, true, false)).not.toThrow();
  });
});
