import { describe, expect, it } from "bun:test";
import { presentTenantWelcomeEmail } from "../src/index";
import { tenantResponseFactory } from "./factories/tenant-response";

const appUrl = "https://app.example.com";

describe("present tenant welcome email in Spanish", () => {
  const viewModel = presentTenantWelcomeEmail({ response: tenantResponseFactory(), locale: "es-ES", appUrl });

  it("names the tenant in the subject", () => {
    expect(viewModel.subject).toBe("Acme Clinic está creada");
  });

  it("states the tenant is ready in the headline", () => {
    expect(viewModel.headline).toBe("Acme Clinic está lista.");
  });

  it("lists the identifier and the formatted creation date", () => {
    expect(viewModel.paragraphs).toEqual(["Identificador: acme-clinic.", "Creada el 15 de enero de 2026."]);
  });

  it("labels the action with the tenant name", () => {
    expect(viewModel.actionLabel).toBe("Abrir Acme Clinic");
  });

  it("carries the language of the locale", () => {
    expect(viewModel.language).toBe("es");
  });
});

describe("present tenant welcome email in English", () => {
  const viewModel = presentTenantWelcomeEmail({ response: tenantResponseFactory(), locale: "en-GB", appUrl });

  it("names the tenant in the subject", () => {
    expect(viewModel.subject).toBe("Acme Clinic is created");
  });

  it("lists the identifier and the formatted creation date", () => {
    expect(viewModel.paragraphs).toEqual(["Identifier: acme-clinic.", "Created on 15 January 2026."]);
  });

  it("labels the action with the tenant name", () => {
    expect(viewModel.actionLabel).toBe("Open Acme Clinic");
  });
});

describe("present tenant welcome email for an unknown locale", () => {
  const viewModel = presentTenantWelcomeEmail({ response: tenantResponseFactory(), locale: "de-DE", appUrl });

  it("falls back to the English copy", () => {
    expect(viewModel.headline).toBe("Acme Clinic is ready.");
  });

  it("reports English as the language", () => {
    expect(viewModel.language).toBe("en");
  });

  it("still formats the date for the requested locale", () => {
    expect(viewModel.paragraphs[1]).toBe("Created on 15. Januar 2026.");
  });
});

describe("present tenant welcome email action", () => {
  it("builds an absolute link to the tenant", () => {
    const viewModel = presentTenantWelcomeEmail({ response: tenantResponseFactory(), locale: "es-ES", appUrl });
    expect(viewModel.actionUrl).toBe("https://app.example.com/tenants/acme-clinic");
  });

  it("tolerates a trailing slash on the application url", () => {
    const viewModel = presentTenantWelcomeEmail({
      response: tenantResponseFactory(),
      locale: "es-ES",
      appUrl: "https://app.example.com/",
    });
    expect(viewModel.actionUrl).toBe("https://app.example.com/tenants/acme-clinic");
  });

  it("carries only strings and lists of strings", () => {
    const viewModel = presentTenantWelcomeEmail({ response: tenantResponseFactory(), locale: "es-ES", appUrl });
    const { paragraphs, ...scalars } = viewModel;
    const values = [...Object.values(scalars), ...paragraphs];
    expect(values.every((value) => typeof value === "string")).toBe(true);
  });
});
