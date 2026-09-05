import { describe, expect, it } from "bun:test";
import { emptyTenantForm, presentTenantForm } from "../src/index";
import { tenantResponseFactory } from "./factories/tenant-response";

const spanishLabels = {
  title: "Nueva organización",
  nameLabel: "Nombre",
  slugLabel: "Identificador",
  submitLabel: "Crear",
};

describe("empty tenant form", () => {
  it("carries the Spanish labels", () => {
    expect(emptyTenantForm("es-ES")).toEqual({ ...spanishLabels, hasErrors: false, errors: [] });
  });

  it("carries the English labels", () => {
    expect(emptyTenantForm("en-GB")).toEqual({
      title: "New organisation",
      nameLabel: "Name",
      slugLabel: "Identifier",
      submitLabel: "Create",
      hasErrors: false,
      errors: [],
    });
  });

  it("falls back to English for an unknown locale", () => {
    expect(emptyTenantForm("de-DE").title).toBe("New organisation");
  });
});

describe("present tenant form", () => {
  it("reports no errors for a successful outcome", () => {
    expect(presentTenantForm({ kind: "ok", value: tenantResponseFactory() }, "es-ES")).toEqual({
      ...spanishLabels,
      hasErrors: false,
      errors: [],
    });
  });

  it("keeps the labels alongside an error", () => {
    const viewModel = presentTenantForm(
      { kind: "conflict", code: "tenant.slug.taken", message: "taken" },
      "es-ES",
    );
    expect(viewModel.submitLabel).toBe("Crear");
  });

  it("translates a conflict into the requested locale", () => {
    const viewModel = presentTenantForm(
      { kind: "conflict", code: "tenant.slug.taken", message: "taken" },
      "es-ES",
    );
    expect(viewModel.errors).toEqual(["Ese identificador ya está en uso."]);
  });

  it("falls back to English for an unknown locale", () => {
    const viewModel = presentTenantForm(
      { kind: "conflict", code: "tenant.slug.taken", message: "taken" },
      "de-DE",
    );
    expect(viewModel.errors).toEqual(["That identifier is already taken."]);
  });

  it("names the offending field of a contract violation", () => {
    const viewModel = presentTenantForm(
      { kind: "invalid", issues: [{ path: "slug", code: "invalid_format", message: "raw" }] },
      "es-ES",
    );
    expect(viewModel.errors).toEqual(["Revisa el identificador."]);
  });

  it("keeps the raw message when nothing is translated", () => {
    const viewModel = presentTenantForm(
      { kind: "forbidden", code: "unknown.code", message: "raw message" },
      "es-ES",
    );
    expect(viewModel.errors).toEqual(["raw message"]);
  });
});
