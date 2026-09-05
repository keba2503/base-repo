import { describe, expect, it } from "bun:test";
import { presentTenant } from "../src/index";
import { tenantResponseFactory } from "./factories/tenant-response";

describe("present tenant", () => {
  it("formats the creation date in Spanish", () => {
    expect(presentTenant(tenantResponseFactory(), "es-ES").createdAtLabel).toBe("15 de enero de 2026");
  });

  it("formats the creation date in English", () => {
    expect(presentTenant(tenantResponseFactory(), "en-GB").createdAtLabel).toBe("15 January 2026");
  });

  it("builds the link to the tenant", () => {
    expect(presentTenant(tenantResponseFactory(), "es-ES").href).toBe("/tenants/acme-clinic");
  });

  it("carries no date object into the view model", () => {
    const viewModel = presentTenant(tenantResponseFactory(), "es-ES");
    expect(Object.values(viewModel).every((value) => typeof value === "string")).toBe(true);
  });
});
