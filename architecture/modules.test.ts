import { describe, expect, it } from "bun:test";
import {
  defaultModuleActivation,
  isModuleActive,
  moduleGraphViolations,
  moduleNames,
  assertModuleGraphIsValid,
} from "./modules";

describe("moduleNames", () => {
  it("lists every module declared in architecture/modules.json", () => {
    expect([...moduleNames].sort()).toEqual(
      ["audit", "billing", "documents", "identity", "jobs", "notifications", "privacy", "tenants"].sort(),
    );
  });
});

describe("defaultModuleActivation", () => {
  it("matches architecture/modules.json exactly, no gate weakened", () => {
    expect(() => assertModuleGraphIsValid(defaultModuleActivation)).not.toThrow();
  });
});

describe("moduleGraphViolations", () => {
  it("flags a core module marked inactive", () => {
    const violations = moduleGraphViolations({ ...defaultModuleActivation, tenants: false });
    expect(violations).toContain('core module "tenants" cannot be inactive');
  });

  it("flags an active module whose dependency is inactive", () => {
    const violations = moduleGraphViolations({ ...defaultModuleActivation, documents: true, jobs: false });
    expect(violations).toContain('module "documents" is active but its dependency "jobs" is not');
  });

  it("flags privacy active while its documents dependency is inactive", () => {
    const violations = moduleGraphViolations({ ...defaultModuleActivation, privacy: true, documents: false });
    expect(violations).toContain('module "privacy" is active but its dependency "documents" is not');
  });

  it("accepts documents and privacy switched off together", () => {
    const violations = moduleGraphViolations({
      ...defaultModuleActivation,
      documents: false,
      privacy: false,
    });
    expect(violations).toEqual([]);
  });

  it("accepts notifications switched off alone", () => {
    const violations = moduleGraphViolations({ ...defaultModuleActivation, notifications: false });
    expect(violations).toEqual([]);
  });
});

describe("isModuleActive", () => {
  it("reads the activation flag from the given map", () => {
    expect(isModuleActive("notifications", { ...defaultModuleActivation, notifications: false })).toBe(false);
    expect(isModuleActive("notifications", { ...defaultModuleActivation, notifications: true })).toBe(true);
  });

  it("falls back to the module.json activation when no map is given", () => {
    expect(isModuleActive("tenants")).toBe(true);
  });
});
