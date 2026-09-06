import { describe, expect, it } from "bun:test";
import { defaultModuleActivation, type ModuleActivation } from "../../../../architecture/modules";
import { defaultRoutes } from "@/api";
import { buildApiDependencies } from "@/main/api";
import { readConsentStatus, recordConsentDecision } from "@/main/privacy";

function activationWith(overrides: Partial<ModuleActivation>): ModuleActivation {
  return { ...defaultModuleActivation, ...overrides };
}

describe("composition root with the documents module inactive", () => {
  const modules = activationWith({ documents: false, privacy: false });

  it("does not mount the document controllers", () => {
    const dependencies = buildApiDependencies(modules);
    expect(dependencies.controllers.documents).toBeUndefined();
  });

  it("does not register any document route", () => {
    const dependencies = buildApiDependencies(modules);
    const routes = defaultRoutes(dependencies);
    expect(routes.some((route) => route.tag === "documents")).toBe(false);
  });

  it("still mounts the core tenant and identity routes", () => {
    const dependencies = buildApiDependencies(modules);
    const routes = defaultRoutes(dependencies);
    expect(routes.some((route) => route.tag === "tenants")).toBe(true);
    expect(routes.some((route) => route.tag === "identity")).toBe(true);
  });
});

describe("composition root with the documents module active", () => {
  it("mounts the document controllers and routes", () => {
    const dependencies = buildApiDependencies(defaultModuleActivation);
    expect(dependencies.controllers.documents).toBeDefined();
    const routes = defaultRoutes(dependencies);
    expect(routes.some((route) => route.tag === "documents")).toBe(true);
  });
});

describe("cookie consent with the privacy module inactive", () => {
  const modules = activationWith({ privacy: false });

  it("reports consent as unknown instead of calling the consent store", async () => {
    const result = await readConsentStatus("00000000-0000-4000-8000-000000000099", modules);
    expect(result.known).toBe(false);
    expect(result.status).toEqual({ functional: false, analytics: false, marketing: false });
  });

  it("does not throw when a decision is submitted", async () => {
    const visitorId = await recordConsentDecision(
      "00000000-0000-4000-8000-000000000099",
      { functional: true, analytics: true, marketing: false },
      modules,
    );
    expect(visitorId).toBe("00000000-0000-4000-8000-000000000099");
  });
});
